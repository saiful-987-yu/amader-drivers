/**
 * drivers.js — the core customer-facing journey:
 * Home -> Choose Bazar -> Choose Vehicle Type -> Driver List -> Driver Details -> Call.
 * No login is required anywhere in this file.
 *
 * PERFORMANCE NOTE: Markets, Vehicle Categories and the Driver
 * directory are preloaded in the background right after the app
 * starts (see Api.preload in api.js, called from app.js). Every
 * view below checks Api.peek*() first — if the data already
 * landed, the view renders immediately with no loading flash;
 * otherwise it shows a loader and awaits the (shared, cached)
 * request normally.
 */
(function (window, document, Utils, Lang, Icons, Api, Router, ViewHelpers, Modal, Toast, Search) {
  "use strict";

  function marketName(market) { return Lang.current() === "bn" ? market.nameBn : market.nameEn; }
  function vehicleName(vehicle) { return Lang.current() === "bn" ? vehicle.nameBn : vehicle.nameEn; }

  // ---------------------------------------------------------
  // CALL HANDLING
  // ---------------------------------------------------------
  function canPlaceCall() {
    // Heuristic: touch-capable devices (phones/tablets) can dial directly.
    return matchMedia("(pointer: coarse)").matches;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  function handleCall(driver, e) {
    if (e) e.stopPropagation();
    const tel = Utils.normalizePhone(driver.phone);
    if (canPlaceCall()) {
      window.location.href = "tel:" + tel;
      return;
    }
    copyToClipboard(tel).then((ok) => {
      Toast.show(ok ? Lang.t("driver.callNotSupported") : tel, ok ? "info" : undefined);
    });
  }

  // ---------------------------------------------------------
  // DRIVER DETAILS MODAL <-> BACK BUTTON INTEGRATION
  // ---------------------------------------------------------
  // Only one driver-details modal exists at a time, so a couple of
  // shared flags are enough to coordinate it with the browser's
  // history. First Back press closes the modal only; the underlying
  // page/route is untouched and the next Back continues normally.
  let driverModalHistoryPushed = false;
  let driverModalClosingFromPopstate = false;

  function openDriverModalWithHistory(contentNode) {
    function onPopState() {
      driverModalClosingFromPopstate = true;
      window.removeEventListener("popstate", onPopState);
      Modal.close();
    }

    Modal.open(contentNode, {
      onClose: () => {
        window.removeEventListener("popstate", onPopState);
        const wasFromPopstate = driverModalClosingFromPopstate;
        driverModalClosingFromPopstate = false;
        if (driverModalHistoryPushed) {
          driverModalHistoryPushed = false;
          if (!wasFromPopstate) {
            // Closed via X / overlay / Escape / breadcrumb link — collapse
            // the extra history entry so Back never hits a phantom stop.
            history.back();
          }
        }
      }
    });

    // Push a history entry (same hash — no route change) so the first
    // Back press closes this modal instead of leaving it stranded on
    // top of whatever the underlying page's own Back would do.
    history.pushState({ driverModal: true }, "", window.location.hash || "#/");
    driverModalHistoryPushed = true;
    window.addEventListener("popstate", onPopState);
  }

  // ---------------------------------------------------------
  // DRIVER CARD + DETAIL
  // ---------------------------------------------------------
  function driverPhotoNode(driver, size) {
    const wrap = Utils.el("div", { class: size === "large" ? "detail-photo" : "driver-card__photo" });
    const url = Utils.resolveImageUrl(driver.imageUrl);
    if (url) {
      // Driver text info is already rendered by the time this image
      // starts loading — the card/detail body never waits on the
      // photo. `loading="lazy"` defers off-screen photos so a long
      // driver grid doesn't fetch every image up front.
      const img = Utils.el("img", { alt: Utils.driverDisplayName(driver), loading: "lazy", decoding: "async" });
      img.src = url;
      img.addEventListener("error", () => {
        wrap.innerHTML = size === "large" ? Icons.userLarge : Icons.user;
      });
      wrap.appendChild(img);
    } else {
      wrap.innerHTML = size === "large" ? Icons.userLarge : Icons.user;
    }
    return wrap;
  }

  function statusNode(driver, large) {
    const available = driver.availability === "active";
    return Utils.el("span", {
      class: "status-dot " + (available ? "status-dot--available" : "status-dot--unavailable") + (large ? " status-dot--lg" : ""),
      text: available ? Lang.t("status.available") : Lang.t("status.unavailable")
    });
  }

  /** Renders a 5-star row (rounded from a raw, possibly decimal/empty value) — never the numeric value itself. */
  function starsNode(ratingRaw) {
    const count = Utils.starCount(ratingRaw);
    const stars = Utils.el("span", { class: "stars", role: "img", "aria-label": Lang.t("driver.ratingAria", { n: count }) });
    for (let i = 1; i <= 5; i++) {
      stars.appendChild(Utils.el("span", {
        class: "star " + (i <= count ? "star--filled" : "star--empty"),
        "aria-hidden": "true", text: i <= count ? "★" : "☆"
      }));
    }
    return stars;
  }

  /** Uppercased, comma-joined display of a possibly multi-value field (e.g. "cng, auto" -> "CNG, AUTO"). */
  function formatMultiUpper(raw) {
    const parts = Utils.splitMulti(raw);
    return parts.length ? parts.map((s) => s.toUpperCase()).join(", ") : "—";
  }

  /** "VEHICLE TYPE · Service Area" — always a single line, Service Area optional. */
  function vehicleServiceLine(driver, vehicleLabel) {
    const label = vehicleLabel || formatMultiUpper(driver.vehicleType);
    const text = driver.serviceArea ? label + " · " + driver.serviceArea : label;
    return Utils.el("div", { class: "driver-card__meta", title: text, text });
  }

  /** "Experience · ★★★★☆" row — Experience hidden when empty, rating always shown (0 stars if empty). */
  function experienceRatingRow(driver) {
    const parts = [];
    if (driver.experience) {
      parts.push(Utils.el("span", { class: "driver-card__experience", text: driver.experience }));
      parts.push(Utils.el("span", { class: "dot-sep", "aria-hidden": "true", text: "·" }));
    }
    parts.push(starsNode(driver.rating));
    return Utils.el("div", { class: "driver-card__rating-row" }, parts);
  }

  function driverCard(driver, vehicleLabel, crumbTrail) {
    const whatsappNumber = Utils.resolveWhatsApp(driver);
    const actions = [
      Utils.el("button", {
        class: "driver-card__call-btn",
        "aria-label": Lang.t("driver.call") + " " + Utils.driverDisplayName(driver),
        html: Icons.phone + "<span>" + Lang.t("driver.call") + "</span>",
        disabled: driver.availability !== "active" ? "true" : null,
        onClick: (e) => driver.availability === "active" && handleCall(driver, e)
      })
    ];
    if (whatsappNumber) {
      actions.push(Utils.el("a", {
        class: "whatsapp-btn", href: Utils.waLink(whatsappNumber), target: "_blank", rel: "noopener",
        "aria-label": Lang.t("driver.whatsapp") + " " + Utils.driverDisplayName(driver), html: Icons.whatsapp,
        onClick: (e) => e.stopPropagation()
      }));
    }
    // A fixed-width empty space always sits at the right edge of the
    // button row, whether or not WhatsApp is shown — the Call button
    // (and WhatsApp, when present) share the remaining width.
    actions.push(Utils.el("div", { class: "driver-card__spacer", "aria-hidden": "true" }));

    const card = Utils.el("div", {
      class: "driver-card", tabindex: "0", role: "button",
      "aria-label": Utils.driverDisplayName(driver),
      onClick: () => openDriverDetail(driver, crumbTrail),
      onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDriverDetail(driver, crumbTrail); } }
    }, [
      driverPhotoNode(driver, "small"),
      Utils.el("div", { class: "driver-card__body" }, [
        Utils.el("div", { class: "driver-card__name", text: Utils.driverDisplayName(driver) }),
        vehicleServiceLine(driver, vehicleLabel),
        experienceRatingRow(driver),
        statusNode(driver),
        Utils.el("div", { class: "driver-card__actions" }, actions)
      ])
    ]);
    return card;
  }

  /** Two-column "label / value" detail row (plain-text values only). */
  function twoColRow(labelA, valueA, labelB, valueB) {
    return Utils.el("div", { class: "detail-row" }, [
      Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: labelA }),
        Utils.el("div", { class: "detail-col__value", text: valueA })
      ]),
      Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: labelB }),
        Utils.el("div", { class: "detail-col__value", text: valueB })
      ])
    ]);
  }

  /**
   * Thumbnail + main-image gallery for "Vehicle Image URL" (comma-separated
   * when a driver has more than one photo). Returns null when the driver
   * has no vehicle images at all, so callers can skip the section entirely.
   */
  function buildGallery(driver) {
    const urls = Utils.splitMulti(driver.vehicleImageUrl).map(Utils.resolveImageUrl).filter(Boolean);
    if (!urls.length) return null;

    const mainImg = Utils.el("img", { alt: Utils.driverDisplayName(driver), loading: "lazy", decoding: "async" });
    const thumbButtons = [];
    let current = 0;

    function show(index) {
      current = (index + urls.length) % urls.length;
      mainImg.src = urls[current];
      thumbButtons.forEach((btn, i) => btn.classList.toggle("is-active", i === current));
    }

    const mainChildren = [mainImg];
    if (urls.length > 1) {
      mainChildren.push(Utils.el("button", {
        type: "button", class: "gallery__arrow gallery__arrow--prev",
        "aria-label": Lang.t("a11y.previousImage"), html: Icons.chevronLeft,
        onClick: () => show(current - 1)
      }));
      mainChildren.push(Utils.el("button", {
        type: "button", class: "gallery__arrow gallery__arrow--next",
        "aria-label": Lang.t("a11y.nextImage"), html: Icons.chevronRight,
        onClick: () => show(current + 1)
      }));
    }
    const mainWrap = Utils.el("div", { class: "gallery__main" }, mainChildren);

    const children = [];
    if (urls.length > 1) {
      const thumbs = urls.map((url, i) => {
        const thumbImg = Utils.el("img", { alt: "", loading: "lazy" });
        thumbImg.src = url;
        const btn = Utils.el("button", {
          type: "button", class: "gallery__thumb", "aria-label": (i + 1) + " / " + urls.length,
          onClick: () => show(i)
        }, [thumbImg]);
        thumbButtons.push(btn);
        return btn;
      });
      children.push(Utils.el("div", { class: "gallery__thumbs" }, thumbs));
    }
    children.push(mainWrap);

    show(0);
    return Utils.el("div", { class: "gallery" }, children);
  }

  /**
   * "Rate This Driver" — UI-only demo widget. Stars are clickable and
   * comment is typeable, but Submit never saves anything anywhere; it
   * just shows a friendly "not available yet" message.
   */
  function buildRatingSection() {
    const starButtons = [];
    const starsRow = Utils.el("div", { class: "rate-stars", role: "radiogroup", "aria-label": Lang.t("driver.ratingSectionTitle") });

    function select(n) {
      starButtons.forEach((btn, idx) => {
        const filled = idx < n;
        btn.classList.toggle("star--filled", filled);
        btn.classList.toggle("star--empty", !filled);
        btn.textContent = filled ? "★" : "☆";
        btn.setAttribute("aria-checked", idx === n - 1 ? "true" : "false");
      });
    }

    for (let i = 1; i <= 5; i++) {
      const btn = Utils.el("button", {
        type: "button", class: "star star--empty", role: "radio", "aria-checked": "false",
        "aria-label": Lang.t("driver.ratingAria", { n: i }), text: "☆",
        onClick: () => select(i)
      });
      starButtons.push(btn);
      starsRow.appendChild(btn);
    }

    const commentInput = Utils.el("textarea", {
      class: "rate-textarea", rows: "3",
      placeholder: Lang.t("driver.ratingCommentPlaceholder"),
      "aria-label": Lang.t("driver.ratingCommentPlaceholder")
    });

    const submitBtn = Utils.el("button", {
      class: "btn btn--primary btn--sm mt-5",
      text: Lang.t("driver.ratingSubmit"),
      onClick: () => Toast.show(Lang.t("driver.ratingUnavailable"))
    });

    return Utils.el("div", { class: "rate-section" }, [
      Utils.el("h3", { class: "detail-section-title", text: Lang.t("driver.ratingSectionTitle") }),
      starsRow,
      commentInput,
      submitBtn
    ]);
  }

  function openDriverDetail(driver, crumbTrail) {
    const children = [];
    if (crumbTrail && crumbTrail.length) {
      const crumbNode = ViewHelpers.breadcrumb(crumbTrail.concat([{ label: Utils.driverDisplayName(driver) }]));
      // Breadcrumb links navigate the underlying page — always close
      // this modal first so it doesn't stay stuck open on top of it.
      Utils.qsa("a", crumbNode).forEach((a) => a.addEventListener("click", () => Modal.close()));
      children.push(crumbNode);
    }

    // Name + Close share one header row, directly under the breadcrumb.
    // The close button lives ONLY here — never beside the gallery below.
    children.push(Utils.el("div", { class: "detail-name-row" }, [
      Utils.el("h2", { class: "detail-name", text: Utils.driverDisplayName(driver) }),
      Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
    ]));

    children.push(driverPhotoNode(driver, "large"));
    children.push(statusNode(driver, true));

    children.push(Utils.el("h3", { class: "detail-section-title", text: Lang.t("driver.information") }));

    children.push(twoColRow(
      Lang.t("driver.vehicleType"), formatMultiUpper(driver.vehicleType),
      Lang.t("driver.vehicleNumber"), driver.vehicleNumber || "—"
    ));

    if (driver.serviceArea) {
      children.push(Utils.el("div", { class: "detail-row" }, [
        Utils.el("div", { class: "detail-col detail-col--full" }, [
          Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.serviceArea") }),
          Utils.el("div", { class: "detail-col__value detail-col__value--truncate", title: driver.serviceArea, text: driver.serviceArea })
        ])
      ]));
    }

    const expRatingCols = [];
    if (driver.experience) {
      expRatingCols.push(Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.experience") }),
        Utils.el("div", { class: "detail-col__value", text: driver.experience })
      ]));
    }
    expRatingCols.push(Utils.el("div", { class: "detail-col" }, [
      Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.rating") }),
      Utils.el("div", { class: "detail-col__value" }, [starsNode(driver.rating)])
    ]));
    children.push(Utils.el("div", { class: "detail-row" }, expRatingCols));

    /** A clickable phone number with a small, consistent call icon in front (still plain text, not a big button). */
    function phoneLinkNode(number) {
      return Utils.el("a", { class: "detail-col__value detail-col__value--link detail-col__value--phone", href: "tel:" + Utils.normalizePhone(number) }, [
        Utils.el("span", { class: "detail-col__phone-icon", "aria-hidden": "true", html: Icons.phone }),
        document.createTextNode(number)
      ]);
    }

    const phoneCols = [
      Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.phone") }),
        phoneLinkNode(driver.phone)
      ])
    ];
    if (driver.altPhone) {
      phoneCols.push(Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.altPhone") }),
        phoneLinkNode(driver.altPhone)
      ]));
    }
    children.push(Utils.el("div", { class: "detail-row" }, phoneCols));

    // Compact, fixed-height action row (matches the Driver Card's Call
    // button height): Call is always present; Call Alternative and
    // WhatsApp only appear when that data actually exists.
    const actionButtons = [
      Utils.el("button", {
        class: "btn btn--primary btn--sm action-row__btn",
        html: Icons.phone + "<span>" + Lang.t("driver.call") + "</span>",
        disabled: driver.availability !== "active" ? "true" : null,
        onClick: () => driver.availability === "active" && handleCall(driver)
      })
    ];
    if (driver.altPhone) {
      actionButtons.push(Utils.el("button", {
        class: "btn btn--ghost btn--sm action-row__btn",
        html: Icons.phone + "<span>" + Lang.t("driver.callAlternative") + "</span>",
        disabled: driver.availability !== "active" ? "true" : null,
        onClick: () => driver.availability === "active" && handleCall(Object.assign({}, driver, { phone: driver.altPhone }))
      }));
    }
    const whatsappNumber = Utils.resolveWhatsApp(driver);
    if (whatsappNumber) {
      actionButtons.push(Utils.el("a", {
        class: "whatsapp-btn", href: Utils.waLink(whatsappNumber), target: "_blank", rel: "noopener",
        "aria-label": Lang.t("driver.whatsapp"), html: Icons.whatsapp
      }));
    }
    children.push(Utils.el("div", { class: "action-row mt-5" }, actionButtons));

    const gallery = buildGallery(driver);
    if (gallery) {
      children.push(Utils.el("h3", { class: "detail-section-title mt-5", text: Lang.t("driver.vehiclePhotos") }));
      children.push(gallery);
    }

    children.push(buildRatingSection());

    openDriverModalWithHistory(Utils.el("div", {}, children));
  }

  // ---------------------------------------------------------
  // HOME VIEW (no breadcrumb — this is the top of the journey)
  // ---------------------------------------------------------
  async function renderHome(app) {
    app.innerHTML = "";

    const hero = Utils.el("section", { class: "hero" }, [
      Utils.el("div", { class: "container hero__inner" }, [
        Utils.el("div", { class: "hero__eyebrow", html: Icons.map + "<span>" + Lang.t("site.tagline") + "</span>" }),
        Utils.el("h1", { text: Lang.t("hero.heading") }),
        Utils.el("p", { text: Lang.t("hero.sub") }),
        Utils.el("div", { class: "hero__actions" }, [
          Utils.el("button", {
            class: "btn btn--primary", text: Lang.t("hero.cta"),
            onClick: () => Router.navigate("/markets")
          }),
          Utils.el("button", {
            class: "btn btn--danger", html: Icons.emergency + "<span>" + Lang.t("hero.emergencyCta") + "</span>",
            onClick: () => Router.navigate("/emergency")
          })
        ])
      ])
    ]);
    app.appendChild(hero);

    const cachedMarkets = Api.peekMarkets();
    const marketSection = Utils.el("section", { class: "section container" }, [
      Utils.el("div", { class: "section-head" }, [
        Utils.el("h2", { text: Lang.t("market.chooseHeading") }),
        Utils.el("p", { text: Lang.t("market.chooseSub") })
      ]),
      cachedMarkets
        ? marketGrid(cachedMarkets, (m) => Router.navigate(`/vehicles/${m.slug}`))
        : ViewHelpers.loadingBlock(Lang.t("market.loading"))
    ]);
    app.appendChild(marketSection);

    appendHowItWorks(app);
    appendRegisterCta(app);

    if (cachedMarkets) return;
    try {
      const markets = await Api.getMarkets();
      const grid = marketGrid(markets, (m) => Router.navigate(`/vehicles/${m.slug}`));
      marketSection.replaceChild(grid, marketSection.lastChild);
    } catch (err) {
      marketSection.replaceChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderHome(app)), marketSection.lastChild);
    }
  }

  /** Generic "Others" tile — reveals everything when the list was capped. */
  function othersChip(onClick) {
    return Utils.el("button", { class: "chip-card chip-card--others", onClick }, [
      Utils.el("div", { class: "chip-card__icon", html: Icons.more }),
      Utils.el("div", { class: "chip-card__name", text: Lang.t("action.others") })
    ]);
  }

  /**
   * 4 or fewer items -> show them all directly. More than 4 -> show only
   * the first 3 plus an "Others" tile that expands the grid in place to
   * reveal the rest (no navigation, no extra request).
   */
  function cappedChipGrid(items, buildChip) {
    if (!items.length) return null;
    let expanded = false;
    const container = Utils.el("div", { class: "chip-grid" });
    function paint() {
      container.innerHTML = "";
      const capped = items.length > 4 && !expanded;
      const visible = capped ? items.slice(0, 3) : items;
      visible.forEach((item) => container.appendChild(buildChip(item)));
      if (capped) container.appendChild(othersChip(() => { expanded = true; paint(); }));
    }
    paint();
    return container;
  }

  function marketGrid(markets, onSelect) {
    if (!markets.length) return ViewHelpers.emptyBlock({ message: Lang.t("market.empty") });
    return cappedChipGrid(markets, (m) =>
      Utils.el("button", { class: "chip-card", onClick: () => onSelect(m) }, [
        Utils.el("div", { class: "chip-card__icon", html: Icons.map }),
        Utils.el("div", { class: "chip-card__name", text: marketName(m) })
      ])
    );
  }

  /** Vehicle-category chip: existing small icon + optional category image + name + dynamic online count. */
  function vehicleChip(v, onSelect, onlineCount) {
    const topChildren = [Utils.el("div", { class: "chip-card__icon", html: Icons.vehicle(v.slug) })];
    const imgUrl = Utils.resolveImageUrl(v.imageUrl);
    if (imgUrl) {
      const img = Utils.el("img", { alt: "", loading: "lazy" });
      img.src = imgUrl;
      const imgWrap = Utils.el("div", { class: "chip-card__image" }, [img]);
      // No image URL, or a broken one -> just fall back to the icon alone (never a broken-image icon).
      img.addEventListener("error", () => imgWrap.remove());
      topChildren.push(imgWrap);
    }
    const count = onlineCount || 0;
    return Utils.el("button", { class: "chip-card chip-card--vehicle", onClick: () => onSelect(v) }, [
      Utils.el("div", { class: "chip-card__top" }, topChildren),
      Utils.el("div", { class: "chip-card__name", text: vehicleName(v) }),
      Utils.el("div", { class: "chip-card__online" }, [
        Utils.el("span", { class: "online-dot", "aria-hidden": "true" }),
        Utils.el("span", { text: Lang.t("vehicle.onlineCount", { n: count }) })
      ])
    ]);
  }

  function vehicleGrid(vehicles, onSelect, onlineCounts) {
    if (!vehicles.length) return ViewHelpers.emptyBlock({ message: Lang.t("vehicle.empty") });
    return cappedChipGrid(vehicles, (v) => vehicleChip(v, onSelect, (onlineCounts && onlineCounts.get(v.slug)) || 0));
  }

  /** Set of vehicle-type slugs that have at least one approved driver in the given market (multi-value aware). */
  function categoriesWithDrivers(directory, marketSlug) {
    const set = new Set();
    directory.forEach((d) => {
      if (Utils.splitMulti(d.marketSlug).includes(marketSlug)) {
        Utils.splitMulti(d.vehicleType).forEach((slug) => set.add(slug));
      }
    });
    return set;
  }

  /**
   * Map of vehicle-type slug -> count of currently AVAILABLE (not
   * unavailable/offline) drivers in the given market, multi-value aware.
   * Reuses the existing availability flag — no new status system.
   */
  function onlineCountByCategory(directory, marketSlug) {
    const counts = new Map();
    directory.forEach((d) => {
      if (d.availability !== "active") return;
      if (!Utils.splitMulti(d.marketSlug).includes(marketSlug)) return;
      Utils.splitMulti(d.vehicleType).forEach((slug) => {
        counts.set(slug, (counts.get(slug) || 0) + 1);
      });
    });
    return counts;
  }

  function appendHowItWorks(app) {
    app.appendChild(Utils.el("section", { class: "section container" }, [
      Utils.el("div", { class: "section-head" }, [Utils.el("h2", { text: Lang.t("howItWorks.heading") })]),
      Utils.el("div", { class: "steps" }, [1, 2, 3].map((n) =>
        Utils.el("div", { class: "step-card" }, [
          Utils.el("div", { class: "step-card__num", text: String(n) }),
          Utils.el("h3", { text: Lang.t(`howItWorks.step${n}.title`) }),
          Utils.el("p", { text: Lang.t(`howItWorks.step${n}.text`) })
        ])
      ))
    ]));
  }

  function appendRegisterCta(app) {
    app.appendChild(Utils.el("section", { class: "section container" }, [
      Utils.el("div", { class: "cta-band" }, [
        Utils.el("h2", { text: Lang.t("registerCta.heading") }),
        Utils.el("p", { text: Lang.t("registerCta.text") }),
        Utils.el("button", { class: "btn btn--accent", text: Lang.t("registerCta.button"), onClick: () => Router.navigate("/register") })
      ])
    ]));
  }

  // ---------------------------------------------------------
  // MARKET SELECTION VIEW (/markets)
  // ---------------------------------------------------------
  async function renderMarkets(app) {
    app.innerHTML = "";
    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("nav.drivers") }
    ]);

    const cachedMarkets = Api.peekMarkets();
    const section = Utils.el("section", { class: "section container" }, [
      crumb,
      Utils.el("div", { class: "section-head" }, [
        Utils.el("h2", { text: Lang.t("market.chooseHeading") }),
        Utils.el("p", { text: Lang.t("market.chooseSub") })
      ]),
      cachedMarkets
        ? marketGrid(cachedMarkets, (m) => Router.navigate(`/vehicles/${m.slug}`))
        : ViewHelpers.loadingBlock(Lang.t("market.loading"))
    ]);
    app.appendChild(section);

    if (cachedMarkets) return;
    try {
      const markets = await Api.getMarkets();
      section.replaceChild(marketGrid(markets, (m) => Router.navigate(`/vehicles/${m.slug}`)), section.lastChild);
    } catch (err) {
      section.replaceChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderMarkets(app)), section.lastChild);
    }
  }

  // ---------------------------------------------------------
  // VEHICLE SELECTION VIEW (/vehicles/:market)
  // ---------------------------------------------------------
  async function renderVehicles(app, params) {
    app.innerHTML = "";

    const cachedMarkets = Api.peekMarkets();
    const cachedVehicles = Api.peekVehicleCategories();
    const cachedDirectory = Api.peekDriverDirectory();

    // A category only appears for THIS market if at least one approved
    // driver there actually has that vehicle type — an active category
    // with zero drivers in this particular market stays hidden here.
    function buildBody(market, vehicles, directory) {
      const availableSlugs = categoriesWithDrivers(directory, market.slug);
      const filtered = vehicles.filter((v) => availableSlugs.has(v.slug));
      const onlineCounts = onlineCountByCategory(directory, market.slug);
      return vehicleGrid(filtered, (v) => Router.navigate(`/drivers/${market.slug}/${v.slug}`), onlineCounts);
    }

    // If we already know the market slug is invalid we still need a
    // network round trip once to find out — but if markets are cached
    // we can validate synchronously and avoid a flash of the wrong UI.
    const knownMarket = cachedMarkets && cachedMarkets.find((m) => m.slug === params.market);
    const allCachedReady = knownMarket && cachedVehicles && cachedDirectory;

    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: knownMarket ? marketName(knownMarket) : "…" }
    ]);

    const section = Utils.el("section", { class: "section container" }, [
      crumb,
      Utils.el("div", { class: "section-head" }, [
        Utils.el("h2", { text: Lang.t("vehicle.chooseHeading") }),
        Utils.el("p", { "data-market-sub": "true", text: knownMarket ? Lang.t("vehicle.chooseSub", { market: marketName(knownMarket) }) : "" })
      ]),
      allCachedReady ? buildBody(knownMarket, cachedVehicles, cachedDirectory) : ViewHelpers.loadingBlock(Lang.t("vehicle.loading"))
    ]);
    app.appendChild(section);

    if (allCachedReady) return;

    try {
      const [markets, vehicles, directory] = await Promise.all([Api.getMarkets(), Api.getVehicleCategories(), Api.getDriverDirectory()]);
      const market = markets.find((m) => m.slug === params.market);
      if (!market) { Router.navigate("/markets"); return; }

      const freshCrumb = ViewHelpers.breadcrumb([
        { label: Lang.t("nav.home"), path: "/" },
        { label: marketName(market) }
      ]);
      section.replaceChild(freshCrumb, section.firstChild);
      section.querySelector("[data-market-sub]").textContent = Lang.t("vehicle.chooseSub", { market: marketName(market) });
      section.replaceChild(buildBody(market, vehicles, directory), section.lastChild);
    } catch (err) {
      section.replaceChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderVehicles(app, params)), section.lastChild);
    }
  }

  // ---------------------------------------------------------
  // DRIVER LIST VIEW (/drivers/:market/:vehicle)
  // ---------------------------------------------------------
  async function renderDriverList(app, params) {
    app.innerHTML = "";

    const cachedMarkets = Api.peekMarkets();
    const cachedVehicles = Api.peekVehicleCategories();
    const knownMarket = cachedMarkets && cachedMarkets.find((m) => m.slug === params.market);
    const knownVehicle = cachedVehicles && cachedVehicles.find((v) => v.slug === params.vehicle);

    const crumbHolder = Utils.el("div");
    function paintCrumb(market, vehicle) {
      crumbHolder.innerHTML = "";
      crumbHolder.appendChild(ViewHelpers.breadcrumb([
        { label: Lang.t("nav.home"), path: "/" },
        { label: market ? marketName(market) : "…", path: market ? `/vehicles/${market.slug}` : null },
        { label: vehicle ? vehicleName(vehicle) : "…" }
      ]));
    }
    paintCrumb(knownMarket, knownVehicle);

    const searchInput = Utils.el("input", {
      type: "search", "data-i18n-placeholder": "search.placeholder",
      placeholder: Lang.t("search.placeholder"), "aria-label": Lang.t("search.heading")
    });
    const searchBar = Utils.el("div", { class: "search-bar" }, [
      Utils.el("span", { html: Icons.search }), searchInput
    ]);

    const availableOnlyToggle = Utils.el("input", { type: "checkbox", id: "avail-only" });
    const filterRow = Utils.el("div", { class: "filter-row" }, [
      Utils.el("span", { class: "result-count", "data-count": "true" }),
      Utils.el("label", { class: "toggle-pill", for: "avail-only" }, [availableOnlyToggle, Utils.el("span", { text: Lang.t("drivers.filterAvailableOnly") })])
    ]);

    const resultsWrap = Utils.el("div", {});
    const section = Utils.el("section", { class: "section container" }, [
      crumbHolder,
      Utils.el("div", { class: "section-head" }, [Utils.el("h2", { "data-heading": "true" })]),
      searchBar, filterRow, resultsWrap
    ]);
    app.appendChild(section);
    if (!Api.peekDriverDirectory()) {
      resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));
    }

    let markets, vehicles;
    try {
      [markets, vehicles] = await Promise.all([Api.getMarkets(), Api.getVehicleCategories()]);
    } catch (err) {
      resultsWrap.innerHTML = "";
      resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderDriverList(app, params)));
      return;
    }
    const market = markets.find((m) => m.slug === params.market);
    const vehicle = vehicles.find((v) => v.slug === params.vehicle);
    if (!market || !vehicle) { Router.navigate("/markets"); return; }

    paintCrumb(market, vehicle);
    const crumbTrail = [
      { label: Lang.t("nav.home"), path: "/" },
      { label: marketName(market), path: `/vehicles/${market.slug}` },
      { label: vehicleName(vehicle), path: `/drivers/${market.slug}/${vehicle.slug}` }
    ];

    section.querySelector("[data-heading]").textContent =
      Lang.t("drivers.heading", { vehicle: vehicleName(vehicle) }) + " " + Lang.t("drivers.subInMarket", { market: marketName(market) });

    async function load(query) {
      // Once the driver directory is cached, filtering is instant and
      // local — no need to show a loader and interrupt the UI.
      const alreadyCached = !!Api.peekDriverDirectory();
      if (!alreadyCached) {
        resultsWrap.innerHTML = "";
        resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));
      }
      try {
        let list = await Api.getDrivers(market.slug, vehicle.slug, query);
        if (availableOnlyToggle.checked) list = list.filter((d) => d.availability === "active");
        renderResults(list, query);
      } catch (err) {
        resultsWrap.innerHTML = "";
        resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => load(query)));
      }
    }

    function renderResults(list, query) {
      resultsWrap.innerHTML = "";
      section.querySelector("[data-count]").textContent = Lang.t("drivers.count", { count: list.length });
      if (!list.length) {
        resultsWrap.appendChild(ViewHelpers.emptyBlock({
          message: query ? Lang.t("empty.noSearchResults") : Lang.t("empty.noDrivers"),
          sub: query ? undefined : Lang.t("empty.noDriversSub"),
          actionLabel: Lang.t("empty.backToVehicleTypes"),
          onAction: () => Router.navigate(`/vehicles/${market.slug}`)
        }));
        return;
      }
      // Api.getDrivers() already returns Active drivers before Inactive ones.
      resultsWrap.appendChild(Utils.el("div", { class: "driver-grid" }, list.map((d) => driverCard(d, vehicleName(vehicle), crumbTrail))));
    }

    const debouncedSearch = Utils.debounce((q) => load(q), 250);
    searchInput.addEventListener("input", () => debouncedSearch(searchInput.value.trim()));
    availableOnlyToggle.addEventListener("change", () => load(searchInput.value.trim()));

    load("");
  }

  // ---------------------------------------------------------
  // GLOBAL QUICK SEARCH VIEW (/search)
  // ---------------------------------------------------------
  async function renderSearch(app) {
    app.innerHTML = "";
    const searchInput = Utils.el("input", {
      type: "search", "data-i18n-placeholder": "search.placeholder",
      placeholder: Lang.t("search.placeholder"), "aria-label": Lang.t("search.heading")
    });
    const resultsWrap = Utils.el("div", { class: "mt-5" });
    const section = Utils.el("section", { class: "section container" }, [
      Utils.el("div", { class: "section-head" }, [Utils.el("h2", { text: Lang.t("search.heading") })]),
      Utils.el("div", { class: "search-bar" }, [Utils.el("span", { html: Icons.search }), searchInput]),
      resultsWrap
    ]);
    app.appendChild(section);

    async function run(query) {
      if (!query) { resultsWrap.innerHTML = ""; return; }
      const alreadyCached = !!Api.peekDriverDirectory();
      resultsWrap.innerHTML = "";
      if (!alreadyCached) resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));
      try {
        let list = await Api.getDrivers(null, null, query);
        list = Search.filterLocal(list, query); // defense-in-depth against backend matching differences
        resultsWrap.innerHTML = "";
        if (!list.length) {
          resultsWrap.appendChild(ViewHelpers.emptyBlock({ message: Lang.t("empty.noSearchResults") }));
          return;
        }
        resultsWrap.appendChild(Utils.el("p", { class: "result-count", text: Lang.t("search.resultsFor", { query }) }));
        resultsWrap.appendChild(Utils.el("div", { class: "driver-grid mt-5" }, list.map((d) => driverCard(d))));
      } catch (err) {
        resultsWrap.innerHTML = "";
        resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => run(query)));
      }
    }

    searchInput.addEventListener("input", Utils.debounce(() => run(searchInput.value.trim()), 300));
    searchInput.focus();
  }

  // ---------------------------------------------------------
  // EMERGENCY CONTACT LIST (/emergency)
  // ---------------------------------------------------------
  async function renderEmergencyList(app) {
    app.innerHTML = "";

    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("emergency.heading") }
    ]);
    const resultsWrap = Utils.el("div", {});
    const section = Utils.el("section", { class: "section container" }, [
      crumb,
      Utils.el("div", { class: "section-head" }, [
        Utils.el("h2", { text: Lang.t("emergency.heading") }),
        Utils.el("p", { text: Lang.t("emergency.sub") })
      ]),
      resultsWrap
    ]);
    app.appendChild(section);

    const alreadyCached = !!Api.peekDriverDirectory();
    if (!alreadyCached) resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));

    try {
      const list = await Api.getEmergencyDrivers();
      resultsWrap.innerHTML = "";
      if (!list.length) {
        resultsWrap.appendChild(ViewHelpers.emptyBlock({ message: Lang.t("empty.noEmergency") }));
        return;
      }
      const crumbTrail = [
        { label: Lang.t("nav.home"), path: "/" },
        { label: Lang.t("emergency.heading"), path: "/emergency" }
      ];
      resultsWrap.appendChild(Utils.el("div", { class: "driver-grid" }, list.map((d) => driverCard(d, null, crumbTrail))));
    } catch (err) {
      resultsWrap.innerHTML = "";
      resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderEmergencyList(app)));
    }
  }

  Router.register("/", renderHome);
  Router.register("/markets", renderMarkets);
  Router.register("/vehicles/:market", renderVehicles);
  Router.register("/drivers/:market/:vehicle", renderDriverList);
  Router.register("/search", renderSearch);
  Router.register("/emergency", renderEmergencyList);
})(window, document, window.Utils, window.Lang, window.Icons, window.Api, window.Router, window.ViewHelpers, window.Modal, window.Toast, window.Search);
