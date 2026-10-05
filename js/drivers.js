(function (window, document, Utils, Lang, Icons, Api, Router, ViewHelpers, Modal, Toast, Search) {
  "use strict";

  function marketName(market) { return Lang.current() === "bn" ? market.nameBn : market.nameEn; }
  function vehicleName(vehicle) { return Lang.current() === "bn" ? vehicle.nameBn : vehicle.nameEn; }

  function speakerButton(text) {
    return Utils.el("button", {
      type: "button", class: "speak-btn",
      "aria-label": Lang.t("a11y.speak", { text }),
      onClick: (e) => { e.stopPropagation(); Utils.speak(text, Lang.current()); },
      html: Icons.speaker
    });
  }

  function speakableHeading(text) {
    return Utils.el("h2", { class: "section-head__title-row" }, [
      Utils.el("span", { text }),
      speakerButton(text)
    ]);
  }

  function speakableHeadingCustom(displayText, spokenText, extraClass) {
    return Utils.el("h2", { class: "section-head__title-row" + (extraClass ? " " + extraClass : "") }, [
      Utils.el("span", { text: displayText }),
      speakerButton(spokenText)
    ]);
  }

  function mutableSpeakerButton(initialText) {
    let spoken = initialText || "";
    const btn = Utils.el("button", {
      type: "button", class: "speak-btn",
      "aria-label": Lang.t("a11y.speak", { text: spoken }),
      onClick: (e) => { e.stopPropagation(); Utils.speak(spoken, Lang.current()); },
      html: Icons.speaker
    });
    btn.setSpokenText = (text) => {
      spoken = text || "";
      btn.setAttribute("aria-label", Lang.t("a11y.speak", { text: spoken }));
    };
    return btn;
  }

  function vehicleHeaderSpeech(marketNameStr) {
    return Lang.current() === "bn"
      ? `${marketNameStr} বাজারে আপনি কোন ধরনের গাড়ির ড্রাইভার খুঁজছেন?`
      : `What type of vehicle driver are you looking for in ${marketNameStr}?`;
  }

  function canPlaceCall() {
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

  function openDriverModalWithHistory(contentNode) {
    Modal.open(contentNode);
  }

  function driverPhotoNode(driver, size) {
    const wrap = Utils.el("div", { class: size === "large" ? "detail-photo" : "driver-card__photo" });
    const url = Utils.resolveImageUrl(driver.imageUrl);
    const localUrl = Utils.localFixtureUrl("profile", driver.driverId);
    if (url || localUrl) {
      const img = Utils.el("img", { alt: Utils.driverDisplayName(driver), loading: "lazy", decoding: "async" });
      Utils.wireImageFallback(img, driver.imageUrl, () => {
        wrap.innerHTML = size === "large" ? Icons.userLarge : Icons.user;
      }, localUrl);
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

  function formatMultiUpper(raw) {
    const parts = Utils.splitMulti(raw);
    return parts.length ? parts.map((s) => s.toUpperCase()).join(", ") : "—";
  }

  function vehicleServiceLine(driver, vehicleLabel) {
    const label = vehicleLabel || formatMultiUpper(driver.vehicleType);
    const text = driver.serviceArea ? label + " · " + driver.serviceArea : label;
    return Utils.el("div", { class: "driver-card__meta", title: text, text });
  }

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
        "aria-label": Lang.t("detail.call") + " " + Utils.driverDisplayName(driver),
        html: Icons.phone + "<span>" + Lang.t("detail.call") + "</span>",
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
      ]),
      window.Admin ? window.Admin.penButton("driver", driver.driverId) : null
    ]);
    return card;
  }

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

  function buildGallery(driver) {
    const rawUrls = Utils.splitMulti(driver.vehicleImageUrl).filter(Boolean);
    const urls = rawUrls.map(Utils.resolveImageUrl);
    if (!urls.length) return null;

    const mainImg = Utils.el("img", { alt: Utils.driverDisplayName(driver), loading: "lazy", decoding: "async" });
    const thumbButtons = [];
    let current = 0;

    function show(index) {
      current = (index + urls.length) % urls.length;
      Utils.wireImageFallback(mainImg, rawUrls[current], () => {});
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
        Utils.wireImageFallback(thumbImg, rawUrls[i], () => {});
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

  function formatReviewDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(Lang.current() === "bn" ? "bn-BD" : "en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch (err) { return ""; }
  }

  function renderReviewList(container, list) {
    container.innerHTML = "";
    if (!list.length) {
      container.appendChild(Utils.el("p", { class: "reviews-empty", text: Lang.t("driver.reviewsEmpty") }));
      return;
    }
    list.forEach((r) => {
      container.appendChild(Utils.el("div", { class: "review-item" }, [
        starsNode(r.stars),
        r.comment ? Utils.el("p", { class: "review-item__comment", text: r.comment }) : null,
        Utils.el("div", { class: "review-item__date", text: formatReviewDate(r.dateTime) })
      ].filter(Boolean)));
    });
  }

  function buildRatingSection(driver) {
    const summaryRow = Utils.el("div", { class: "reviews-summary" }, [
      starsNode(driver.finalRating),
      Utils.el("span", { class: "reviews-summary__value", text: (Number(driver.finalRating) || 0).toFixed(1) }),
      Utils.el("span", { class: "reviews-summary__count", text: Lang.t("driver.reviewCount", { n: driver.publicRatingCount || 0 }) })
    ]);

    const listContainer = Utils.el("div", { class: "reviews-list" }, [ViewHelpers.loadingBlock()]);
    const expandedContainer = Utils.el("div", { class: "reviews-list reviews-list--expanded" });
    expandedContainer.style.display = "none";

    const viewAllBtn = Utils.el("button", {
      type: "button", class: "btn btn--ghost btn--sm reviews-view-all-btn", text: Lang.t("driver.viewAllReviews")
    });
    const closeReviewsBtn = Utils.el("button", {
      type: "button", class: "btn btn--ghost btn--sm reviews-view-all-btn", text: Lang.t("driver.closeReviews")
    });
    closeReviewsBtn.style.display = "none";
    if ((driver.publicRatingCount || 0) <= 2) viewAllBtn.style.display = "none";

    const reviewBubble = Utils.el("span", { class: "review-bubble", text: Lang.t("detail.reviewBubble") });
    const reviewActionRow = Utils.el("div", { class: "reviews-action-row" }, [viewAllBtn, closeReviewsBtn, reviewBubble]);
    function syncReviewActionRow() {
      const anyBtn = viewAllBtn.style.display !== "none" || closeReviewsBtn.style.display !== "none";
      reviewActionRow.classList.toggle("is-solo", !anyBtn);
    }
    syncReviewActionRow();

    Api.getPublicRatings("driver", driver.driverId, false)
      .then((list) => renderReviewList(listContainer, list))
      .catch(() => renderReviewList(listContainer, []));

    viewAllBtn.addEventListener("click", async () => {
      viewAllBtn.disabled = true;
      try {
        const all = await Api.getPublicRatings("driver", driver.driverId, true);
        renderReviewList(expandedContainer, all);
        listContainer.style.display = "none";
        expandedContainer.style.display = "";
        viewAllBtn.style.display = "none";
        closeReviewsBtn.style.display = "";
        syncReviewActionRow();
      } catch (err) {
        Toast.show(Lang.t("error.network"), "error");
      } finally {
        viewAllBtn.disabled = false;
      }
    });

    closeReviewsBtn.addEventListener("click", () => {
      expandedContainer.style.display = "none";
      expandedContainer.innerHTML = "";
      listContainer.style.display = "";
      closeReviewsBtn.style.display = "none";
      if ((driver.publicRatingCount || 0) > 2) viewAllBtn.style.display = "";
      syncReviewActionRow();
    });

    const starButtons = [];
    let selectedStars = 0;
    const starsRow = Utils.el("div", { class: "rate-stars", role: "radiogroup", "aria-label": Lang.t("detail.rateSectionTitle") });

    function select(n) {
      selectedStars = n;
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
      class: "btn btn--primary btn--sm",
      text: Lang.t("driver.ratingSubmit"),
      onClick: async () => {
        if (!selectedStars) { Toast.show(Lang.t("driver.ratingSelectStars")); return; }
        submitBtn.disabled = true;
        try {
          await Api.submitPublicRating("driver", driver.driverId, selectedStars, commentInput.value);
          Toast.show(Lang.t("driver.ratingSubmitted"), "success");
          commentInput.value = "";
          select(0);
        } catch (err) {
          Toast.show(Lang.t("error.generic"), "error");
        } finally {
          submitBtn.disabled = false;
        }
      }
    });

    return Utils.el("div", { class: "rate-section" }, [
      Utils.el("h3", { class: "detail-section-title", text: Lang.t("detail.rateSectionTitle") }),
      summaryRow,
      listContainer,
      expandedContainer,
      reviewActionRow,
      starsRow,
      commentInput,
      Utils.el("div", { class: "rate-submit-row" }, [submitBtn])
    ]);
  }

  function openDriverDetail(driver, crumbTrail) {
    const children = [];
    if (crumbTrail && crumbTrail.length) {
      const crumbNode = ViewHelpers.breadcrumb(crumbTrail.concat([{ label: Utils.driverDisplayName(driver) }]));
      Utils.qsa("a", crumbNode).forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        const target = a.getAttribute("href");
        Modal.closeThen(() => { window.location.hash = target; });
      }));
      children.push(crumbNode);
    }

    children.push(Utils.el("div", { class: "detail-name-row" }, [
      Utils.el("h2", { class: "detail-name", text: Utils.driverDisplayName(driver) }),
      Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
    ]));

    children.push(driverPhotoNode(driver, "large"));
    children.push(statusNode(driver, true));

    children.push(Utils.el("h3", { class: "detail-section-title", text: Lang.t("detail.information") }));

    children.push(twoColRow(
      Lang.t("detail.serviceType"), formatMultiUpper(driver.vehicleType),
      Lang.t("detail.regNumber"), driver.vehicleNumber || "—"
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
        Utils.el("div", { class: "detail-col__label", text: Lang.t("detail.experience") }),
        Utils.el("div", { class: "detail-col__value", text: driver.experience })
      ]));
    }
    expRatingCols.push(Utils.el("div", { class: "detail-col" }, [
      Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.rating") }),
      Utils.el("div", { class: "detail-col__value" }, [starsNode(driver.rating)])
    ]));
    children.push(Utils.el("div", { class: "detail-row" }, expRatingCols));

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

    const actionButtons = [
      Utils.el("button", {
        class: "btn btn--primary btn--sm action-row__btn",
        html: Icons.phone + "<span>" + Lang.t("detail.call") + "</span>",
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
      children.push(Utils.el("h3", { class: "detail-section-title mt-5", text: Lang.t("detail.photos") }));
      children.push(gallery);
    }

    if (Utils.clean(driver.personalDetails)) {
      children.push(Utils.el("div", { class: "personal-details-section mt-5" }, [
        Utils.el("h3", { class: "detail-section-title", text: Lang.t("detail.personalDetails") }),
        Utils.el("div", { class: "personal-details", html: Utils.safeHtml(driver.personalDetails) })
      ]));
    }

    children.push(buildRatingSection(driver));
    const socialSection = Utils.buildSocialLinksSection(driver.socialUrl);
    if (socialSection) children.push(socialSection);

    const videoSection = Utils.buildVideoSection(driver.videoUrl, Lang.t("detail.video"));
    if (videoSection) { videoSection.classList.add("mt-5"); children.push(videoSection); }

    children.push(Utils.buildFooterClone());

    openDriverModalWithHistory(Utils.el("div", {}, children));
  }

  async function renderHome(app) {
    app.innerHTML = "";

    const hero = Utils.el("section", { class: "hero hero--compact" }, [
      Utils.el("div", { class: "container hero__inner" }, [
        speakableHeadingCustom(Lang.t("hero.heading"), Lang.t("hero.tagline"), "hero__heading"),
        Utils.el("p", { class: "hero__tagline", text: Lang.t("hero.tagline") })
      ])
    ]);
    app.appendChild(hero);

    app.appendChild(buildBanner());

    app.appendChild(Utils.el("div", { class: "container home-actions" }, [
      Utils.el("div", { class: "hero__actions" }, [
        Utils.el("button", {
          class: "btn btn--primary btn--compact", text: Lang.t("hero.cta"),
          onClick: () => Router.navigate("/markets")
        }),
        Utils.el("button", {
          class: "btn btn--danger btn--compact btn--emergency",
          onClick: () => Router.navigate("/emergency")
        }, [
          Utils.el("span", { class: "emergency-icon", "aria-hidden": "true", text: "🚑" }),
          Utils.el("span", { text: Lang.t("hero.emergencyCta") })
        ])
      ])
    ]));

    const cachedMarkets = Api.peekMarkets();
    let marketSection;
    const refreshMarketGrid = () => {
      const fresh = Api.peekMarkets();
      if (fresh && marketSection) marketSection.replaceChild(marketGrid(fresh, (m) => Router.navigate(`/markets/${m.slug}`)), marketSection.lastChild);
    };
    marketSection = Utils.el("section", { class: "section section--flush-top container" }, [
      marketSectionHead(refreshMarketGrid),
      cachedMarkets
        ? marketGrid(cachedMarkets, (m) => Router.navigate(`/markets/${m.slug}`))
        : ViewHelpers.loadingBlock(Lang.t("market.loading"))
    ]);
    app.appendChild(marketSection);

    appendHowItWorks(app);
    appendRegisterCta(app);
    appendOtherSection(app);
    appendDoctorSection(app);

    if (cachedMarkets) return;
    try {
      const markets = await Api.getMarkets();
      const grid = marketGrid(markets, (m) => Router.navigate(`/markets/${m.slug}`));
      marketSection.replaceChild(grid, marketSection.lastChild);
    } catch (err) {
      marketSection.replaceChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderHome(app)), marketSection.lastChild);
    }
  }

  function othersChip(onClick) {
    return Utils.el("button", { class: "chip-card chip-card--others", onClick }, [
      Utils.el("div", { class: "chip-card__icon", html: Icons.more }),
      Utils.el("div", { class: "chip-card__name", text: Lang.t("action.others") })
    ]);
  }

  const expandedChipGrids = {};

  function cappedChipGrid(items, buildChip) {
    if (!items.length) return null;
    const gridKey = window.location.hash || "#/";
    let expanded = !!expandedChipGrids[gridKey];
    const container = Utils.el("div", { class: "chip-grid" });
    function paint() {
      container.innerHTML = "";
      const capped = items.length > 4 && !expanded;
      const visible = capped ? items.slice(0, 3) : items;
      visible.forEach((item) => container.appendChild(buildChip(item)));
      if (capped) container.appendChild(othersChip(() => { expanded = true; expandedChipGrids[gridKey] = true; paint(); }));
    }
    paint();
    return container;
  }

  const MARKET_ORDER_KEY = "nobi.marketOrder";

  function applyCustomMarketOrder(markets) {
    const order = Utils.storage.get(MARKET_ORDER_KEY, null);
    if (!order || !order.length) return markets;
    const rank = new Map(order.map((slug, i) => [slug, i]));
    return markets.slice().sort((a, b) => {
      const ra = rank.has(a.slug) ? rank.get(a.slug) : order.length;
      const rb = rank.has(b.slug) ? rank.get(b.slug) : order.length;
      return ra - rb;
    });
  }

  function marketSectionHead(onSaved) {
    const heading = speakableHeading(Lang.t("market.chooseHeading"));
    heading.appendChild(Utils.el("button", {
      type: "button", class: "icon-btn section-head__sort-btn",
      "aria-label": Lang.t("marketOrder.button"), title: Lang.t("marketOrder.button"),
      html: Icons.sort,
      onClick: () => openMarketOrderModal(onSaved)
    }));
    return Utils.el("div", { class: "section-head" }, [
      heading,
      Utils.el("p", { text: Lang.t("market.chooseSub") })
    ]);
  }

  function openMarketOrderModal(onSaved) {
    const markets = Api.peekMarkets();
    if (!markets || !markets.length) { Toast.show(Lang.t("market.loading")); return; }
    let order = applyCustomMarketOrder(markets).map((m) => m.slug);
    const listWrap = Utils.el("div", { class: "market-order-list" });

    function renderRows() {
      listWrap.innerHTML = "";
      order.forEach((slug, i) => {
        const m = markets.find((mm) => mm.slug === slug);
        if (!m) return;
        const upBtn = Utils.el("button", {
          type: "button", class: "icon-btn", "aria-label": Lang.t("marketOrder.moveUp"), html: Icons.chevronUp,
          onClick: () => { if (i === 0) return; [order[i - 1], order[i]] = [order[i], order[i - 1]]; renderRows(); }
        });
        const downBtn = Utils.el("button", {
          type: "button", class: "icon-btn", "aria-label": Lang.t("marketOrder.moveDown"), html: Icons.chevronDown,
          onClick: () => { if (i === order.length - 1) return; [order[i + 1], order[i]] = [order[i], order[i + 1]]; renderRows(); }
        });
        upBtn.disabled = i === 0;
        downBtn.disabled = i === order.length - 1;
        listWrap.appendChild(Utils.el("div", { class: "market-order-row" }, [
          Utils.el("span", { class: "market-order-row__name", text: marketName(m) }),
          Utils.el("div", { class: "market-order-row__btns" }, [upBtn, downBtn])
        ]));
      });
    }
    renderRows();

    const saveBtn = Utils.el("button", { type: "button", class: "btn btn--primary", text: Lang.t("marketOrder.save") });
    saveBtn.addEventListener("click", () => {
      Utils.storage.set(MARKET_ORDER_KEY, order);
      Modal.close();
      Toast.show(Lang.t("marketOrder.saved"), "success");
      if (onSaved) onSaved();
    });
    const resetBtn = Utils.el("button", { type: "button", class: "btn btn--ghost", text: Lang.t("marketOrder.reset") });
    resetBtn.addEventListener("click", () => {
      Utils.storage.remove(MARKET_ORDER_KEY);
      Modal.close();
      Toast.show(Lang.t("marketOrder.resetDone"));
      if (onSaved) onSaved();
    });

    Modal.open(Utils.el("div", {}, [
      Utils.el("div", { class: "modal-head" }, [
        Utils.el("h3", { text: Lang.t("marketOrder.title") }),
        Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
      ]),
      Utils.el("p", { class: "market-order-hint", text: Lang.t("marketOrder.hint") }),
      listWrap,
      Utils.el("div", { class: "market-order-actions" }, [resetBtn, saveBtn])
    ]));
  }

  function applyMarketCardBackground(card, url, localUrl) {
    if (!url && !localUrl) return;
    const probe = Utils.el("img", { alt: "" });
    Utils.wireImageFallback(probe, url, () => {}, localUrl, () => {
      card.style.backgroundImage = `linear-gradient(rgba(10, 30, 20, 0.45), rgba(10, 30, 20, 0.45)), url("${probe.src}")`;
      card.classList.add("chip-card--market-has-bg");
    });
  }

  function marketGrid(markets, onSelect) {
    if (!markets.length) return ViewHelpers.emptyBlock({ message: Lang.t("market.empty") });
    markets = applyCustomMarketOrder(markets);
    return cappedChipGrid(markets, (m) => {
      const topChildren = [Utils.el("div", { class: "chip-card__icon", html: Icons.map })];
      const imgUrl = Utils.resolveImageUrl(m.imageUrl);
      const localImgUrl = Utils.localFixtureUrl("market", m.slug);
      if (imgUrl || localImgUrl) {
        const img = Utils.el("img", { alt: "", loading: "lazy" });
        const imgWrap = Utils.el("div", { class: "chip-card__image" }, [img]);
        Utils.wireImageFallback(img, m.imageUrl, () => imgWrap.remove(), localImgUrl);
        topChildren.push(imgWrap);
      }
      const name = marketName(m);
      const card = Utils.el("div", {
        class: "chip-card chip-card--vehicle chip-card--market",
        role: "button", tabindex: "0", "aria-label": name,
        onClick: () => onSelect(m),
        onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(m); } }
      }, [
        Utils.el("div", { class: "chip-card__top" }, topChildren),
        Utils.el("div", { class: "chip-card__name" }, [
          Utils.el("span", { class: "chip-card__name-text", text: name }),
          speakerButton(name)
        ])
      ]);
      applyMarketCardBackground(card, Utils.resolveImageUrl(m.bgImageUrl), Utils.localFixtureUrl("marketBg", m.slug));
      return card;
    });
  }

  function vehicleChip(v, onSelect, onlineCount) {
    const topChildren = [Utils.el("div", { class: "chip-card__icon", html: Icons.vehicle(v.slug) })];
    const imgUrl = Utils.resolveImageUrl(v.imageUrl);
    const localImgUrl = Utils.localFixtureUrl("vehicle", v.slug);
    if (imgUrl || localImgUrl) {
      const img = Utils.el("img", { alt: "", loading: "lazy" });
      const imgWrap = Utils.el("div", { class: "chip-card__image" }, [img]);
      Utils.wireImageFallback(img, v.imageUrl, () => imgWrap.remove(), localImgUrl);
      topChildren.push(imgWrap);
    }
    const count = onlineCount || 0;
    const name = vehicleName(v);
    return Utils.el("div", {
      class: "chip-card chip-card--vehicle",
      role: "button", tabindex: "0", "aria-label": name,
      onClick: () => onSelect(v),
      onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(v); } }
    }, [
      Utils.el("div", { class: "chip-card__top" }, topChildren),
      Utils.el("div", { class: "chip-card__name" }, [
        Utils.el("span", { class: "chip-card__name-text", text: name }),
        speakerButton(name)
      ]),
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

  function categoriesWithDrivers(directory, marketSlug) {
    const set = new Set();
    directory.forEach((d) => {
      if (Utils.splitMulti(d.marketSlug).includes(marketSlug)) {
        Utils.splitMulti(d.vehicleType).forEach((slug) => set.add(slug));
      }
    });
    return set;
  }

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
        Utils.el("div", { class: "step-card step-card--" + n }, [
          Utils.el("div", { class: "step-card__num", text: String(n) }),
          Utils.el("h3", { text: Lang.t(`howItWorks.step${n}.title`) }),
          Utils.el("p", { text: Lang.t(`howItWorks.step${n}.text`) })
        ])
      ))
    ]));
  }

  function applyCtaBandBackground(el, path) {
    if (!path) return;
    el.style.backgroundImage = `linear-gradient(rgba(10, 30, 20, 0.55), rgba(10, 30, 20, 0.55)), url("${path}")`;
  }

  function appendRegisterCta(app) {
    const band = Utils.el("div", { class: "cta-band" }, [
      Utils.el("h2", { text: Lang.t("registerCta.heading") }),
      Utils.el("p", { text: Lang.t("registerCta.text") }),
      Utils.el("button", { class: "btn btn--accent", text: Lang.t("registerCta.button"), onClick: () => Router.navigate("/registration") })
    ]);
    applyCtaBandBackground(band, (window.NOBI_CONFIG.SECTION_BACKGROUNDS || {}).registration);
    app.appendChild(Utils.el("section", { class: "section container" }, [band]));
  }

  function appendOtherSection(app) {
    const band = Utils.el("div", { class: "cta-band cta-band--other" }, [
      Utils.el("h2", { text: Lang.t("other.sectionHeading") }),
      Utils.el("p", { text: Lang.t("other.sectionSub") }),
      Utils.el("button", { class: "btn btn--accent", text: Lang.t("other.sectionCta"), onClick: () => Router.navigate("/other") })
    ]);
    applyCtaBandBackground(band, (window.NOBI_CONFIG.SECTION_BACKGROUNDS || {}).other);
    app.appendChild(Utils.el("section", { class: "section container" }, [band]));
  }

  function appendDoctorSection(app) {
    const band = Utils.el("div", { class: "cta-band" }, [
      Utils.el("h2", { text: Lang.t("doctor.sectionHeading") }),
      Utils.el("p", { text: Lang.t("doctor.sectionSub") }),
      Utils.el("button", {
        class: "btn btn--accent", html: Icons.doctor + "<span>" + Lang.t("doctor.sectionCta") + "</span>",
        onClick: () => Router.navigate("/doctor")
      })
    ]);
    applyCtaBandBackground(band, (window.NOBI_CONFIG.SECTION_BACKGROUNDS || {}).doctor);
    app.appendChild(Utils.el("section", { class: "section container" }, [band]));
  }

  function buildBanner() {
    const bannerImages = window.NOBI_CONFIG.BANNER_IMAGES || {};
    const slideDefs = [
      { type: "dynamic", src: bannerImages.slide1 },
      { src: bannerImages.slide2 },
      { src: bannerImages.slide3 }
    ];
    const realCount = slideDefs.length;
    const frameCount = realCount + 2;
    const stepPercent = 100 / frameCount;

    const track = Utils.el("div", { class: "banner__track" });
    track.style.width = (frameCount * 100) + "%";
    track.appendChild(buildSlide(slideDefs[realCount - 1]));
    slideDefs.forEach((def) => track.appendChild(buildSlide(def)));
    track.appendChild(buildSlide(slideDefs[0]));
    Utils.qsa(".banner__slide", track).forEach((el) => { el.style.width = stepPercent + "%"; });

    const dots = slideDefs.map((_, i) =>
      Utils.el("button", { type: "button", class: "banner__dot" + (i === 0 ? " is-active" : ""), "aria-label": "Slide " + (i + 1) })
    );
    const dotsRow = Utils.el("div", { class: "banner__dots" }, dots);

    const viewport = Utils.el("div", { class: "banner__viewport" }, [track]);
    const root = Utils.el("div", { class: "banner" }, [Utils.el("div", { class: "container" }, [viewport, dotsRow])]);

    let real = 0;
    let frame = 1;
    let intervalId = null;

    function paint(animate) {
      track.style.transition = animate ? "" : "none";
      track.style.transform = "translateX(-" + (frame * stepPercent) + "%)";
      dots.forEach((d, i) => d.classList.toggle("is-active", i === real));
      if (!animate) {
        void track.offsetHeight;
        track.style.transition = "";
      }
    }

    function goToIndex(i) {
      real = (i + realCount) % realCount;
      frame = real + 1;
      paint(true);
    }

    function step(delta) {
      real = (real + delta + realCount) % realCount;
      frame += delta;
      paint(true);
    }

    track.addEventListener("transitionend", () => {
      if (frame === 0 || frame === frameCount - 1) { frame = real + 1; paint(false); }
    });

    function startTimer() {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!document.body.contains(root)) { clearInterval(intervalId); return; }
        step(1);
      }, 5000);
    }

    dots.forEach((d, i) => d.addEventListener("click", () => { goToIndex(i); startTimer(); }));

    let touchStartX = null;
    viewport.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    viewport.addEventListener("touchend", (e) => {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) < 30) return;
      step(dx < 0 ? 1 : -1);
      startTimer();
    }, { passive: true });

    paint(false);
    startTimer();
    return root;
  }

  function buildSlide(def) {
    if (def.type === "dynamic") {
      const slide = Utils.el("div", { class: "banner__slide banner__slide--text" }, [
        Utils.el("div", { class: "banner__slide-text" }, [
          Utils.el("h2", { text: Lang.t("hero.heading") }),
          Utils.el("p", { class: "banner__slide-sub", text: Lang.t("hero.tagline") })
        ])
      ]);
      if (def.src) {
        const probe = new Image();
        probe.onload = () => {
          slide.style.backgroundImage = `linear-gradient(rgba(10, 30, 20, 0.45), rgba(10, 30, 20, 0.45)), url("${def.src}")`;
        };
        probe.src = def.src;
      }
      return slide;
    }
    const slide = Utils.el("div", { class: "banner__slide" });
    const placeholder = () => {
      slide.innerHTML = "";
      slide.classList.add("banner__slide--placeholder");
      slide.innerHTML = Icons.map;
    };
    if (def.src) {
      const img = Utils.el("img", { alt: "", loading: "lazy" });
      img.addEventListener("error", placeholder);
      img.src = def.src;
      slide.appendChild(img);
    } else {
      placeholder();
    }
    return slide;
  }

  async function renderMarkets(app) {
    app.innerHTML = "";
    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("nav.markets") }
    ]);

    const cachedMarkets = Api.peekMarkets();
    let section;
    const refreshMarketGrid = () => {
      const fresh = Api.peekMarkets();
      if (fresh && section) section.replaceChild(marketGrid(fresh, (m) => Router.navigate(`/markets/${m.slug}`)), section.lastChild);
    };
    section = Utils.el("section", { class: "section container" }, [
      crumb,
      marketSectionHead(refreshMarketGrid),
      cachedMarkets
        ? marketGrid(cachedMarkets, (m) => Router.navigate(`/markets/${m.slug}`))
        : ViewHelpers.loadingBlock(Lang.t("market.loading"))
    ]);
    app.appendChild(section);

    if (cachedMarkets) return;
    try {
      const markets = await Api.getMarkets();
      section.replaceChild(marketGrid(markets, (m) => Router.navigate(`/markets/${m.slug}`)), section.lastChild);
    } catch (err) {
      section.replaceChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderMarkets(app)), section.lastChild);
    }
  }

  async function renderVehicles(app, params) {
    app.innerHTML = "";

    const cachedMarkets = Api.peekMarkets();
    const cachedVehicles = Api.peekVehicleCategories();
    const cachedDirectory = Api.peekDriverDirectory();

    function buildBody(market, vehicles, directory) {
      const availableSlugs = categoriesWithDrivers(directory, market.slug);
      const filtered = vehicles.filter((v) => !v.isOther && availableSlugs.has(v.slug));
      const onlineCounts = onlineCountByCategory(directory, market.slug);
      return vehicleGrid(filtered, (v) => Router.navigate(`/markets/${market.slug}/${v.slug}`), onlineCounts);
    }

    const knownMarket = cachedMarkets && cachedMarkets.find((m) => m.slug === params.market);
    const allCachedReady = knownMarket && cachedVehicles && cachedDirectory;

    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("nav.markets"), path: "/markets" },
      { label: knownMarket ? marketName(knownMarket) : "…" }
    ]);

    const vehicleSpeaker = mutableSpeakerButton(knownMarket ? vehicleHeaderSpeech(marketName(knownMarket)) : "");
    const vehicleHeadingRow = Utils.el("h2", { class: "section-head__title-row" }, [
      Utils.el("span", { text: Lang.t("vehicle.chooseHeading") }),
      vehicleSpeaker
    ]);

    const section = Utils.el("section", { class: "section container" }, [
      crumb,
      Utils.el("div", { class: "section-head" }, [
        vehicleHeadingRow,
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
        { label: Lang.t("nav.markets"), path: "/markets" },
        { label: marketName(market) }
      ]);
      section.replaceChild(freshCrumb, section.firstChild);
      section.querySelector("[data-market-sub]").textContent = Lang.t("vehicle.chooseSub", { market: marketName(market) });
      vehicleSpeaker.setSpokenText(vehicleHeaderSpeech(marketName(market)));
      section.replaceChild(buildBody(market, vehicles, directory), section.lastChild);
    } catch (err) {
      section.replaceChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderVehicles(app, params)), section.lastChild);
    }
  }

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
        { label: Lang.t("nav.markets"), path: "/markets" },
        { label: market ? marketName(market) : "…", path: market ? `/markets/${market.slug}` : null },
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
      { label: Lang.t("nav.markets"), path: "/markets" },
      { label: marketName(market), path: `/markets/${market.slug}` },
      { label: vehicleName(vehicle), path: `/markets/${market.slug}/${vehicle.slug}` }
    ];

    section.querySelector("[data-heading]").textContent =
      Lang.t("drivers.heading", { vehicle: vehicleName(vehicle) }) + " " + Lang.t("drivers.subInMarket", { market: marketName(market) });

    async function load(query) {
      const alreadyCached = !!Api.peekDriverDirectory();
      if (!alreadyCached) {
        resultsWrap.innerHTML = "";
        renderedCards.clear();
        resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));
      }
      try {
        let list = await Api.getDrivers(market.slug, vehicle.slug, query);
        if (availableOnlyToggle.checked) list = list.filter((d) => d.availability === "active");
        renderResults(list, query);
      } catch (err) {
        resultsWrap.innerHTML = "";
        renderedCards.clear();
        resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => load(query)));
      }
    }

    let renderedCards = new Map();

    function renderResults(list, query) {
      section.querySelector("[data-count]").textContent = Lang.t("drivers.count", { count: list.length });
      if (!list.length) {
        resultsWrap.innerHTML = "";
        renderedCards.clear();
        resultsWrap.appendChild(ViewHelpers.emptyBlock({
          message: query ? Lang.t("empty.noSearchResults") : Lang.t("empty.noDrivers"),
          sub: query ? undefined : Lang.t("empty.noDriversSub"),
          actionLabel: Lang.t("empty.backToVehicleTypes"),
          onAction: () => Router.navigate(`/markets/${market.slug}`)
        }));
        return;
      }
      let grid = resultsWrap.querySelector(".driver-grid");
      if (!grid) {
        resultsWrap.innerHTML = "";
        grid = Utils.el("div", { class: "driver-grid" });
        resultsWrap.appendChild(grid);
        renderedCards.clear();
      }
      const nextIds = new Set();
      list.forEach((d) => {
        const id = d.driverId;
        nextIds.add(id);
        const sig = JSON.stringify(d);
        const existing = renderedCards.get(id);
        let node;
        if (existing && existing.sig === sig) {
          node = existing.node;
        } else {
          node = driverCard(d, vehicleName(vehicle), crumbTrail);
          if (existing && existing.node.parentNode) existing.node.parentNode.removeChild(existing.node);
          renderedCards.set(id, { node, sig });
        }
        grid.appendChild(node);
      });
      renderedCards.forEach((entry, id) => {
        if (!nextIds.has(id)) {
          if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
          renderedCards.delete(id);
        }
      });
    }

    const debouncedSearch = Utils.debounce((q) => load(q), 250);
    searchInput.addEventListener("input", () => debouncedSearch(searchInput.value.trim()));
    availableOnlyToggle.addEventListener("change", () => load(searchInput.value.trim()));

    load("");
  }

  function buildOtherBody(vehicles, directory) {
    const withDrivers = new Set();
    const onlineCounts = new Map();
    directory.forEach((d) => {
      Utils.splitMulti(d.vehicleType).forEach((slug) => {
        withDrivers.add(slug);
        if (d.availability === "active") onlineCounts.set(slug, (onlineCounts.get(slug) || 0) + 1);
      });
    });
    const filtered = vehicles.filter((v) => v.isOther && withDrivers.has(v.slug));
    if (!filtered.length) return ViewHelpers.emptyBlock({ message: Lang.t("other.empty") });
    return vehicleGrid(filtered, (v) => Router.navigate(`/other/${v.slug}`), onlineCounts);
  }

  async function renderOtherCategories(app) {
    app.innerHTML = "";
    const cachedVehicles = Api.peekVehicleCategories();
    const cachedDirectory = Api.peekDriverDirectory();
    const ready = cachedVehicles && cachedDirectory;

    const section = Utils.el("section", { class: "section container" }, [
      ViewHelpers.breadcrumb([
        { label: Lang.t("nav.home"), path: "/" },
        { label: Lang.t("other.sectionHeading") }
      ]),
      Utils.el("div", { class: "section-head" }, [
        speakableHeading(Lang.t("other.sectionHeading")),
        Utils.el("p", { text: Lang.t("other.chooseSub") })
      ]),
      ready ? buildOtherBody(cachedVehicles, cachedDirectory) : ViewHelpers.loadingBlock(Lang.t("vehicle.loading"))
    ]);
    app.appendChild(section);

    if (ready) return;

    try {
      const [vehicles, directory] = await Promise.all([Api.getVehicleCategories(), Api.getDriverDirectory()]);
      section.replaceChild(buildOtherBody(vehicles, directory), section.lastChild);
    } catch (err) {
      section.replaceChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderOtherCategories(app)), section.lastChild);
    }
  }

  async function renderOtherDriverList(app, params) {
    app.innerHTML = "";

    const cachedVehicles = Api.peekVehicleCategories();
    const knownVehicle = cachedVehicles && cachedVehicles.find((v) => v.slug === params.vehicle);

    const crumbHolder = Utils.el("div");
    function paintCrumb(vehicle) {
      crumbHolder.innerHTML = "";
      crumbHolder.appendChild(ViewHelpers.breadcrumb([
        { label: Lang.t("nav.home"), path: "/" },
        { label: Lang.t("other.sectionHeading"), path: "/other" },
        { label: vehicle ? vehicleName(vehicle) : "…" }
      ]));
    }
    paintCrumb(knownVehicle);

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

    let vehicles;
    try {
      vehicles = await Api.getVehicleCategories();
    } catch (err) {
      resultsWrap.innerHTML = "";
      resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderOtherDriverList(app, params)));
      return;
    }
    const vehicle = vehicles.find((v) => v.slug === params.vehicle);
    if (!vehicle || !vehicle.isOther) { Router.navigate("/other"); return; }

    paintCrumb(vehicle);
    const crumbTrail = [
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("other.sectionHeading"), path: "/other" },
      { label: vehicleName(vehicle), path: `/other/${vehicle.slug}` }
    ];

    section.querySelector("[data-heading]").textContent =
      Lang.t("drivers.heading", { vehicle: vehicleName(vehicle) });

    async function load(query) {
      const alreadyCached = !!Api.peekDriverDirectory();
      if (!alreadyCached) {
        resultsWrap.innerHTML = "";
        renderedCards.clear();
        resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));
      }
      try {
        let list = await Api.getDrivers(null, vehicle.slug, query);
        if (availableOnlyToggle.checked) list = list.filter((d) => d.availability === "active");
        renderResults(list, query);
      } catch (err) {
        resultsWrap.innerHTML = "";
        renderedCards.clear();
        resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => load(query)));
      }
    }

    let renderedCards = new Map();

    function renderResults(list, query) {
      section.querySelector("[data-count]").textContent = Lang.t("drivers.count", { count: list.length });
      if (!list.length) {
        resultsWrap.innerHTML = "";
        renderedCards.clear();
        resultsWrap.appendChild(ViewHelpers.emptyBlock({
          message: query ? Lang.t("empty.noSearchResults") : Lang.t("empty.noDrivers"),
          sub: query ? undefined : Lang.t("empty.noDriversSub"),
          actionLabel: Lang.t("other.backToCategories"),
          onAction: () => Router.navigate("/other")
        }));
        return;
      }
      let grid = resultsWrap.querySelector(".driver-grid");
      if (!grid) {
        resultsWrap.innerHTML = "";
        grid = Utils.el("div", { class: "driver-grid" });
        resultsWrap.appendChild(grid);
        renderedCards.clear();
      }
      const nextIds = new Set();
      list.forEach((d) => {
        const id = d.driverId;
        nextIds.add(id);
        const sig = JSON.stringify(d);
        const existing = renderedCards.get(id);
        let node;
        if (existing && existing.sig === sig) {
          node = existing.node;
        } else {
          node = driverCard(d, vehicleName(vehicle), crumbTrail);
          if (existing && existing.node.parentNode) existing.node.parentNode.removeChild(existing.node);
          renderedCards.set(id, { node, sig });
        }
        grid.appendChild(node);
      });
      renderedCards.forEach((entry, id) => {
        if (!nextIds.has(id)) {
          if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
          renderedCards.delete(id);
        }
      });
    }

    const debouncedSearch = Utils.debounce((q) => load(q), 250);
    searchInput.addEventListener("input", () => debouncedSearch(searchInput.value.trim()));
    availableOnlyToggle.addEventListener("change", () => load(searchInput.value.trim()));

    load("");
  }

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
        list = Search.filterLocal(list, query);
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

  async function renderEmergencyList(app) {
    app.innerHTML = "";

    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("emergency.heading") }
    ]);
    const searchInput = Utils.el("input", {
      type: "search", "data-i18n-placeholder": "search.placeholder",
      placeholder: Lang.t("search.placeholder"), "aria-label": Lang.t("search.heading")
    });
    const searchBar = Utils.el("div", { class: "search-bar" }, [
      Utils.el("span", { html: Icons.search }), searchInput
    ]);
    const availableOnlyToggle = Utils.el("input", { type: "checkbox", id: "avail-only" });
    const countNode = Utils.el("span", { class: "result-count" });
    const filterRow = Utils.el("div", { class: "filter-row" }, [
      countNode,
      Utils.el("label", { class: "toggle-pill", for: "avail-only" }, [availableOnlyToggle, Utils.el("span", { text: Lang.t("drivers.filterAvailableOnly") })])
    ]);
    const resultsWrap = Utils.el("div", {});
    const section = Utils.el("section", { class: "section container" }, [
      crumb,
      Utils.el("div", { class: "section-head" }, [
        speakableHeadingCustom(Lang.t("emergency.heading"), Lang.t("emergency.sub")),
        Utils.el("p", { text: Lang.t("emergency.sub") })
      ]),
      searchBar,
      filterRow,
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
      function paintList(query) {
        resultsWrap.innerHTML = "";
        let shown = Search.filterLocal(list, query);
        if (availableOnlyToggle.checked) shown = shown.filter((d) => d.availability === "active");
        countNode.textContent = Lang.t("drivers.count", { count: shown.length });
        if (!shown.length) {
          resultsWrap.appendChild(ViewHelpers.emptyBlock({ message: Lang.t("empty.noSearchResults") }));
          return;
        }
        resultsWrap.appendChild(Utils.el("div", { class: "driver-grid" }, shown.map((d) => driverCard(d, null, crumbTrail))));
      }
      paintList("");
      const debouncedFilter = Utils.debounce((q) => paintList(q), 250);
      searchInput.addEventListener("input", () => debouncedFilter(searchInput.value.trim()));
      availableOnlyToggle.addEventListener("change", () => paintList(searchInput.value.trim()));
    } catch (err) {
      resultsWrap.innerHTML = "";
      resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderEmergencyList(app)));
    }
  }

  async function renderDoctorList(app) {
    app.innerHTML = "";

    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("doctor.heading") }
    ]);
    const searchInput = Utils.el("input", {
      type: "search", "data-i18n-placeholder": "search.placeholderDoctor",
      placeholder: Lang.t("search.placeholderDoctor"), "aria-label": Lang.t("search.heading")
    });
    const searchBar = Utils.el("div", { class: "search-bar" }, [
      Utils.el("span", { html: Icons.search }), searchInput
    ]);
    const availableOnlyToggle = Utils.el("input", { type: "checkbox", id: "avail-only" });
    const countNode = Utils.el("span", { class: "result-count" });
    const filterRow = Utils.el("div", { class: "filter-row" }, [
      countNode,
      Utils.el("label", { class: "toggle-pill", for: "avail-only" }, [availableOnlyToggle, Utils.el("span", { text: Lang.t("drivers.filterAvailableOnly") })])
    ]);
    const resultsWrap = Utils.el("div", {});
    const section = Utils.el("section", { class: "section container" }, [
      crumb,
      Utils.el("div", { class: "section-head" }, [
        speakableHeadingCustom(Lang.t("doctor.pageHeading"), Lang.t("doctor.sectionSub")),
        Utils.el("p", { text: Lang.t("doctor.sectionSub") })
      ]),
      searchBar,
      filterRow,
      resultsWrap
    ]);
    app.appendChild(section);

    const alreadyCached = !!Api.peekDriverDirectory();
    if (!alreadyCached) resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));

    try {
      const list = await Api.getDoctorDrivers();
      resultsWrap.innerHTML = "";
      if (!list.length) {
        resultsWrap.appendChild(ViewHelpers.emptyBlock({ message: Lang.t("empty.noDoctors") }));
        return;
      }
      const crumbTrail = [
        { label: Lang.t("nav.home"), path: "/" },
        { label: Lang.t("doctor.heading"), path: "/doctor" }
      ];
      function paintList(query) {
        resultsWrap.innerHTML = "";
        let shown = Search.filterLocal(list, query);
        if (availableOnlyToggle.checked) shown = shown.filter((d) => d.availability === "active");
        countNode.textContent = Lang.t("doctors.count", { count: shown.length });
        if (!shown.length) {
          resultsWrap.appendChild(ViewHelpers.emptyBlock({ message: Lang.t("empty.noDoctorSearchResults") }));
          return;
        }
        resultsWrap.appendChild(Utils.el("div", { class: "driver-grid" }, shown.map((d) => driverCard(d, null, crumbTrail))));
      }
      paintList("");
      const debouncedFilter = Utils.debounce((q) => paintList(q), 250);
      searchInput.addEventListener("input", () => debouncedFilter(searchInput.value.trim()));
      availableOnlyToggle.addEventListener("change", () => paintList(searchInput.value.trim()));
    } catch (err) {
      resultsWrap.innerHTML = "";
      resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderDoctorList(app)));
    }
  }

  Router.register("/", renderHome);
  Router.register("/markets", renderMarkets, ["/"]);
  Router.register("/markets/:market", renderVehicles, ["/", "/markets"]);
  Router.register("/markets/:market/:vehicle", renderDriverList, ["/", "/markets", "/markets/:market"]);
  Router.register("/search", renderSearch, ["/"]);
  Router.register("/emergency", renderEmergencyList, ["/"]);
  Router.register("/doctor", renderDoctorList, ["/"]);
  Router.register("/other", renderOtherCategories, ["/"]);
  Router.register("/other/:vehicle", renderOtherDriverList, ["/", "/other"]);
})(window, document, window.Utils, window.Lang, window.Icons, window.Api, window.Router, window.ViewHelpers, window.Modal, window.Toast, window.Search);
