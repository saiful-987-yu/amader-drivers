/**
 * profile.js — driver-only screens: Login and My Profile.
 * My Profile covers: header (photo/name/vehicle type/rating/
 * experience, with a vehicle-type-driven background), Account
 * Overview, Service Areas, Vehicle Information (+ photo gallery),
 * Profile Fields with a single "Edit Profile" action, Change
 * Password, Vehicle Photos, a big Availability toggle, and Logout
 * with a confirmation dialog. Customers never need this file.
 */
(function (window, document, Utils, Lang, Icons, Auth, Api, Router, ViewHelpers, Toast, Modal) {
  "use strict";

  // ---------------------------------------------------------
  // Small local helpers. A few of these are near-identical to ones
  // in drivers.js/registration.js — kept as their own copies here
  // so every Profile-section change stays isolated to this one
  // file and never touches those other screens.
  // ---------------------------------------------------------

  function marketLabel(slug) {
    // Falls back to a title-cased slug if the Markets list hasn't
    // loaded — good enough for a label since we already have the
    // driver's raw slug either way.
    return slug ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
  }

  function localizedName(item) {
    const isBn = Lang.current() === "bn";
    return (isBn && item.nameBn) ? item.nameBn : item.nameEn;
  }

  /** Every market slug on `raw` (comma-separated), resolved to a display name via `markets` when possible, else a title-cased slug. */
  function resolveMarketNames(raw, markets) {
    const map = {};
    (markets || []).forEach((m) => { map[m.slug] = m; });
    return Utils.splitMulti(raw).map((slug) => map[slug] ? localizedName(map[slug]) : marketLabel(slug));
  }

  /** Every vehicle-type slug on `raw`, resolved to a display name via `categories` when possible, else the uppercased slug. */
  function resolveVehicleTypeNames(raw, categories) {
    const map = {};
    (categories || []).forEach((c) => { map[c.slug] = c; });
    return Utils.splitMulti(raw).map((slug) => map[slug] ? localizedName(map[slug]) : slug.toUpperCase());
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

  function statusPill(text, tone) {
    return Utils.el("span", { class: "status-pill status-pill--" + tone, text });
  }

  function overviewItem(iconHtml, label, valueNode) {
    return Utils.el("div", { class: "overview-item" }, [
      Utils.el("div", { class: "overview-icon", html: iconHtml }),
      Utils.el("div", { style: "min-width:0;" }, [
        Utils.el("div", { class: "overview-label", text: label }),
        typeof valueNode === "string"
          ? Utils.el("div", { class: "overview-value", text: valueNode })
          : Utils.el("div", { class: "overview-value" }, [valueNode])
      ])
    ]);
  }

  /** Small field-row builder for the Edit Profile / Change Password modal forms — same markup shape as registration.js's own fieldRow(), kept as a separate copy so Profile-section work never touches registration.js. */
  function formField({ id, labelText, type, value }) {
    const label = Utils.el("label", { for: id, text: labelText });
    const control = Utils.el("input", { id, name: id, type: type || "text", value: value || "" });
    const errorMsg = Utils.el("div", { class: "error-msg", "data-error-for": id });
    const wrap = Utils.el("div", { class: "field", "data-field": id }, [label, control, errorMsg]);
    return { wrap, control };
  }

  function setFieldError(root, id, message) {
    const field = root.querySelector('[data-field="' + id + '"]');
    if (!field) return;
    field.classList.toggle("has-error", !!message);
    const err = field.querySelector(".error-msg");
    if (err) err.textContent = message || "";
  }

  /**
   * Vehicle photos gallery — same look/behaviour (main image + prev/
   * next arrows + a thumbnail strip when there's more than one
   * photo) as the public Driver Detail gallery, but its own copy so
   * this Profile-only screen never depends on drivers.js. Shows a
   * clean "No photos available" state instead of an empty gallery
   * when the driver has no vehicle images at all.
   */
  function buildVehicleGallery(driver) {
    const rawUrls = Utils.splitMulti(driver.vehicleImageUrl).filter(Boolean);
    const urls = rawUrls.map(Utils.resolveImageUrl);
    if (!urls.length) {
      return Utils.el("div", { class: "vehicle-gallery-empty" }, [
        Utils.el("div", { html: Icons.gallery }),
        Utils.el("p", { text: Lang.t("profile.noPhotos") })
      ]);
    }

    const mainImg = Utils.el("img", { alt: Utils.driverDisplayName(driver), loading: "lazy", decoding: "async" });
    const thumbButtons = [];
    let current = 0;

    function show(index) {
      current = (index + urls.length) % urls.length;
      Utils.wireImageFallback(mainImg, rawUrls[current], () => {});
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
        Utils.wireImageFallback(thumbImg, rawUrls[i], () => {});
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

  // ---------------------------------------------------------
  // LOGIN VIEW (unchanged — outside the Profile section's scope)
  // ---------------------------------------------------------
  function renderLogin(app) {
    app.innerHTML = "";
    if (Auth.isLoggedIn()) { Router.navigate("/profile"); return; }

    const idInput = Utils.el("input", { id: "identifier", type: "text", autocomplete: "username" });
    const pwInput = Utils.el("input", { id: "password", type: "password", autocomplete: "current-password" });

    const pwWrap = Utils.el("div", { class: "password-field" }, [pwInput]);
    const pwToggle = Utils.el("button", {
      type: "button", "aria-label": Lang.t("login.showPassword"), html: Icons.eye,
      onClick: () => {
        const showing = pwInput.type === "text";
        pwInput.type = showing ? "password" : "text";
        pwToggle.innerHTML = showing ? Icons.eye : Icons.eyeOff;
      }
    });
    pwWrap.appendChild(pwToggle);

    const errorMsg = Utils.el("div", { class: "error-msg", style: "display:none;color:var(--color-danger);font-size:var(--font-size-sm);margin-top:var(--space-2);" });

    const submitBtn = Utils.el("button", { class: "btn btn--primary btn--block", text: Lang.t("login.submit") });

    const form = Utils.el("form", {}, [
      Utils.el("div", { class: "field" }, [Utils.el("label", { for: "identifier", text: Lang.t("login.usernameLabel") }), idInput]),
      Utils.el("div", { class: "field" }, [Utils.el("label", { for: "password", text: Lang.t("login.passwordLabel") }), pwWrap]),
      errorMsg,
      submitBtn,
      Utils.el("p", { class: "text-center mt-5 hint" }, [
        document.createTextNode(Lang.t("login.noAccount") + " "),
        Utils.el("a", { href: "#/registration", text: Lang.t("login.registerLink") })
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorMsg.style.display = "none";
      submitBtn.disabled = true;
      const original = submitBtn.textContent;
      submitBtn.textContent = Lang.t("loading.generic");
      try {
        await Auth.login(idInput.value, pwInput.value);
        Router.navigate("/profile");
      } catch (err) {
        // Only an explicit "wrong username/password" from the backend
        // should say so — a timeout, network hiccup, or a server-side
        // misconfiguration (e.g. a missing/misnamed sheet) must NEVER
        // be shown as "invalid credentials", or a driver with a
        // perfectly correct password would wrongly think it's wrong.
        let key = "login.error.generic";
        if (err.code === "PENDING_APPROVAL") key = "login.error.pending";
        else if (err.code === "INVALID_CREDENTIALS") key = "login.error";
        errorMsg.textContent = Lang.t(key);
        errorMsg.style.display = "block";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    });

    app.appendChild(Utils.el("section", { class: "section container" }, [
      Utils.el("div", { class: "section-head text-center" }, [
        Utils.el("h2", { text: Lang.t("login.heading") }),
        Utils.el("p", { text: Lang.t("login.sub") })
      ]),
      Utils.el("div", { class: "form-card" }, [form])
    ]));
  }

  // ---------------------------------------------------------
  // PROFILE VIEW
  // ---------------------------------------------------------
  async function renderProfile(app) {
    app.innerHTML = "";
    if (!Auth.isLoggedIn()) {
      app.appendChild(Utils.el("section", { class: "section container" }, [
        ViewHelpers.emptyBlock({
          message: Lang.t("profile.loginRequired"), icon: Icons.userLarge,
          actionLabel: Lang.t("nav.login"), onAction: () => Router.navigate("/login")
        })
      ]));
      return;
    }

    // Same cache-then-refresh pattern used for Markets/Vehicle
    // Categories/Driver+Doctor directories elsewhere in the app: a
    // synchronous peek paints instantly from the last-known data (if
    // any) — no loading spinner, no network wait — while Auth.getProfile()
    // still runs underneath to silently confirm/refresh it. This also
    // means a plain language toggle (which re-renders the current
    // route from scratch) never re-triggers a full network load here.
    const cachedDriver = Auth.peekProfile();
    const cachedMarkets = Api.peekMarkets();
    const cachedVehicleCategories = Api.peekVehicleCategories();

    const section = Utils.el("section", { class: "section container" });
    app.appendChild(section);

    if (cachedDriver) {
      section.classList.add("profile-page");
      paintProfile(app, section, cachedDriver, cachedMarkets || [], cachedVehicleCategories || []);
    } else {
      section.appendChild(ViewHelpers.loadingBlock());
    }

    try {
      const results = await Promise.all([
        Auth.getProfile(),
        Api.getMarkets().catch(() => cachedMarkets || []),
        Api.getVehicleCategories().catch(() => cachedVehicleCategories || [])
      ]);
      if (!app.contains(section)) return; // navigated away before this settled
      const driver = results[0];
      const markets = results[1] || [];
      const vehicleCategories = results[2] || [];
      section.classList.add("profile-page");
      paintProfile(app, section, driver, markets, vehicleCategories);
    } catch (err) {
      if (!app.contains(section)) return;
      if (err.code === "SESSION_EXPIRED") {
        Toast.show(Lang.t("error.sessionExpired"), "error");
        Router.navigate("/login");
        return;
      }
      // A cached profile is already on screen — a failed silent
      // refresh (e.g. offline/slow network) shouldn't replace it with
      // an error; just keep showing what we already have.
      if (cachedDriver) return;
      section.innerHTML = "";
      section.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderProfile(app)));
    }
  }

  function paintProfile(app, section, driver, markets, vehicleCategories) {
    section.innerHTML = "";

    // ---------- Header hero ----------
    const photoWrap = Utils.el("div", { class: "profile-photo" });
    const photoUrl = Utils.resolveImageUrl(driver.imageUrl);
    if (photoUrl) {
      const img = Utils.el("img", { alt: Utils.driverDisplayName(driver) });
      Utils.wireImageFallback(img, driver.imageUrl, () => { photoWrap.innerHTML = Icons.userLarge; });
      img.src = photoUrl;
      photoWrap.appendChild(img);
    } else {
      photoWrap.innerHTML = Icons.userLarge;
    }

    const vehicleSlugs = Utils.splitMulti(driver.vehicleType);
    const primarySlug = vehicleSlugs[0] || "";
    // Only these get their own tinted background — everything else
    // (including an unrecognised/blank slug) keeps the neutral default.
    const heroModifier = ["cng", "auto", "van", "motorcycle", "easy-bike"].indexOf(primarySlug) !== -1 ? primarySlug : "";

    const accountStatus = driver.accountStatus || "active";
    const isVerified = accountStatus === "active";
    const badge = Utils.el("span", { class: "profile-badge profile-badge--" + accountStatus }, [
      Utils.el("span", { html: Icons.checkCircle, style: "display:flex;" }),
      Utils.el("span", { text: isVerified ? Lang.t("profile.verifiedBadge") : Lang.t("profile.accountStatus." + accountStatus) })
    ]);

    const ratingNum = parseFloat(driver.rating);
    const ratingDisplay = isNaN(ratingNum) ? "0.0" : ratingNum.toFixed(1);

    const hero = Utils.el("div", { class: "profile-hero" + (heroModifier ? " profile-hero--" + heroModifier : "") }, [
      Utils.el("div", { class: "profile-hero__decor", html: Icons.vehicle(primarySlug || "other") }),
      Utils.el("div", { class: "profile-hero__top" }, [
        photoWrap,
        Utils.el("div", { style: "min-width:0;" }, [
          badge,
          Utils.el("h1", { class: "profile-name", text: Utils.driverDisplayName(driver) }),
          Utils.el("div", { class: "profile-vehicle-type", text: resolveVehicleTypeNames(driver.vehicleType, vehicleCategories).join(", ") || "—" }),
          Utils.el("div", { class: "profile-meta-row" }, [
            starsNode(driver.rating),
            document.createTextNode(Lang.t("profile.ratingLabel", { rating: ratingDisplay })),
            Utils.el("span", { class: "dot-sep", text: "|" }),
            Utils.el("span", { html: Icons.shield, style: "display:inline-flex;" }),
            Utils.el("span", { text: driver.experience || "—" })
          ])
        ])
      ])
    ]);

    // ---------- Account Overview ----------
    const whatsappNumber = Utils.resolveWhatsApp(driver);
    const availabilityPill = statusPill(
      driver.availability === "active" ? Lang.t("profile.setActive") : Lang.t("profile.setInactive"),
      driver.availability === "active" ? "success" : "neutral"
    );
    const overviewGrid = Utils.el("div", {}, [
      Utils.el("div", { class: "overview-grid overview-grid--top" }, [
        overviewItem(Icons.userLarge, Lang.t("profile.driverId"), driver.driverId || "—"),
        overviewItem(Icons.phone, Lang.t("profile.primaryPhone"), driver.phone || "—"),
        overviewItem(Icons.whatsapp, Lang.t("driver.whatsapp"), statusPill(
          whatsappNumber ? Lang.t("profile.whatsappActive") : Lang.t("profile.whatsappInactive"),
          whatsappNumber ? "success" : "neutral"
        ))
      ]),
      Utils.el("div", { class: "overview-grid overview-grid--bottom" }, [
        overviewItem(Icons.userLarge, Lang.t("profile.accountStatus"), statusPill(
          Lang.t("profile.accountStatus." + accountStatus),
          accountStatus === "active" ? "success" : (accountStatus === "pending" ? "warning" : "danger")
        )),
        overviewItem(Icons.checkCircle, Lang.t("profile.availability"), availabilityPill),
        overviewItem(Icons.shield, Lang.t("profile.adminStatus"), statusPill("False", "neutral"))
      ])
    ]);

    const accountOverviewCard = Utils.el("div", { class: "profile-card" }, [
      Utils.el("div", { class: "profile-card__head" }, [
        Utils.el("h2", { html: Icons.userLarge + "<span>" + Lang.t("profile.accountOverview") + "</span>" })
      ]),
      overviewGrid
    ]);

    // ---------- Service Areas ----------
    const marketNames = resolveMarketNames(driver.marketSlug, markets);
    const serviceAreasCard = Utils.el("div", { class: "profile-card" }, [
      Utils.el("div", { class: "profile-card__head" }, [
        Utils.el("h2", { html: Icons.map + "<span>" + Lang.t("profile.serviceAreas") + "</span>" }),
        editProfileButton()
      ]),
      marketNames.length
        ? Utils.el("div", { class: "info-chip-row" }, marketNames.map((name) => Utils.el("span", { class: "info-chip", text: name })))
        : null,
      Utils.el("div", { class: "service-area-row" }, [
        Utils.el("span", { html: Icons.map }),
        Utils.el("div", {}, [
          Utils.el("div", { class: "service-area-row__label", text: Lang.t("driver.serviceArea") }),
          Utils.el("div", { class: "service-area-row__text", text: driver.serviceArea || "—" })
        ])
      ])
    ].filter(Boolean));

    // ---------- Vehicle Information ----------
    const vehiclePhotoUrlsRaw = Utils.splitMulti(driver.vehicleImageUrl).filter(Boolean);
    const vehiclePhotoUrls = vehiclePhotoUrlsRaw.map(Utils.resolveImageUrl);
    const thumb = Utils.el("button", { type: "button", class: "vehicle-thumb", onClick: () => openVehiclePhotosModal(driver) });
    if (vehiclePhotoUrls.length) {
      const img = Utils.el("img", { alt: "", loading: "lazy" });
      Utils.wireImageFallback(img, vehiclePhotoUrlsRaw[0], () => { thumb.innerHTML = Icons.vehicle(primarySlug || "other"); });
      img.src = vehiclePhotoUrls[0];
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = Icons.vehicle(primarySlug || "other");
    }

    // Up to 3 more photos shown as a small stacked column next to the
    // main photo — the same existing vehicleImageUrl list, just laid
    // out differently. A "+N" badge on the last small tile covers any
    // photos beyond these 4 (still all reachable in the same gallery
    // modal, unchanged).
    const sideUrls = vehiclePhotoUrls.slice(1, 4);
    const sideUrlsRaw = vehiclePhotoUrlsRaw.slice(1, 4);
    let sideColumn = null;
    if (sideUrls.length) {
      const extraCount = vehiclePhotoUrls.length - 4;
      const sideThumbs = sideUrls.map((url, i) => {
        const isLast = i === sideUrls.length - 1;
        const img = Utils.el("img", { alt: "", loading: "lazy" });
        Utils.wireImageFallback(img, sideUrlsRaw[i], () => { img.remove(); });
        img.src = url;
        const children = [img];
        if (isLast && extraCount > 0) children.push(Utils.el("span", { class: "vehicle-side-thumb__badge", text: "+" + extraCount }));
        return Utils.el("button", { type: "button", class: "vehicle-side-thumb", onClick: () => openVehiclePhotosModal(driver) }, children);
      });
      sideColumn = Utils.el("div", { class: "vehicle-gallery-compact__side" }, sideThumbs);
    }

    const galleryBlock = Utils.el("div", { class: "vehicle-gallery-compact" }, [thumb, sideColumn].filter(Boolean));

    const vehicleInfoCard = Utils.el("div", { class: "profile-card" }, [
      Utils.el("div", { class: "profile-card__head" }, [
        Utils.el("h2", { html: Icons.vehicle(primarySlug || "other") + "<span>" + Lang.t("profile.vehicleInformation") + "</span>" }),
        editProfileButton()
      ]),
      Utils.el("div", { class: "vehicle-info-grid" }, [
        galleryBlock,
        Utils.el("div", { class: "vehicle-info-top" }, [
          overviewItem(Icons.vehicle(primarySlug || "other"), Lang.t("driver.vehicleNumber"), driver.vehicleNumber || "—"),
          overviewItem(Icons.shield, Lang.t("driver.experience"), driver.experience || "—")
        ]),
        overviewItem(Icons.userLarge, Lang.t("driver.vehicleType"), resolveVehicleTypeNames(driver.vehicleType, vehicleCategories).join(", ") || "—"),
        overviewItem(Icons.map, Lang.t("profile.preferredBazar"),
          marketNames.length
            ? Utils.el("div", { class: "info-chip-row", style: "margin-bottom:0;" }, marketNames.map((name) => Utils.el("span", { class: "info-chip", text: name })))
            : "—")
      ])
    ]);

    // ---------- Profile Fields ----------
    const profileFieldsCard = Utils.el("div", { class: "profile-card" }, [
      Utils.el("div", { class: "profile-card__head" }, [
        Utils.el("h2", { html: Icons.userLarge + "<span>" + Lang.t("profile.profileFields") + "</span>" }),
        editProfileButton()
      ]),
      Utils.el("div", { class: "profile-fields-grid" }, [
        overviewItem(Icons.userLarge, Lang.t("profile.bengaliName"), driver.nameBn || "—"),
        overviewItem(Icons.phone, Lang.t("driver.altPhone"), driver.altPhone || "—"),
        overviewItem(Icons.userLarge, Lang.t("profile.guardianName"), driver.guardianName || "—"),
        overviewItem(Icons.userLarge, Lang.t("profile.email"), driver.email || "—")
      ])
    ]);

    function editProfileButton() {
      return Utils.el("button", {
        type: "button", class: "pill-btn", html: Icons.pencil + "<span>" + Lang.t("action.edit") + "</span>",
        onClick: () => openEditProfileModal(driver, () => paintProfile(app, section, driver, markets, vehicleCategories))
      });
    }

    // ---------- Change Password / Vehicle Photos link rows ----------
    const changePasswordRow = Utils.el("button", { type: "button", class: "profile-link-row", onClick: () => openChangePasswordModal() }, [
      Utils.el("div", { class: "profile-link-row__icon", html: Icons.lock }),
      Utils.el("div", { class: "profile-link-row__body" }, [
        Utils.el("div", { class: "profile-link-row__title", text: Lang.t("profile.changePassword") }),
        Utils.el("div", { class: "profile-link-row__sub", text: Lang.t("profile.changePasswordSub") })
      ]),
      Utils.el("span", { class: "profile-link-row__chevron", html: Icons.chevronRight })
    ]);

    const vehiclePhotosRow = Utils.el("button", { type: "button", class: "profile-link-row", onClick: () => openVehiclePhotosModal(driver) }, [
      Utils.el("div", { class: "profile-link-row__icon", html: Icons.gallery }),
      Utils.el("div", { class: "profile-link-row__body" }, [
        Utils.el("div", { class: "profile-link-row__title", text: Lang.t("driver.vehiclePhotos") }),
        Utils.el("div", { class: "profile-link-row__sub", text: Lang.t("profile.vehiclePhotosSub") })
      ]),
      Utils.el("span", { class: "profile-link-row__chevron", html: Icons.chevronRight })
    ]);

    // ---------- Availability — big, clear toggle ----------
    const activeOption = Utils.el("button", { type: "button", class: "availability-toggle__option" }, [
      Utils.el("span", { html: Icons.checkCircle }),
      Utils.el("span", {}, [
        Utils.el("span", { class: "availability-toggle__title", text: Lang.t("profile.setActive") }),
        Utils.el("span", { class: "availability-toggle__sub", text: Lang.t("profile.availableDesc") })
      ])
    ]);
    const inactiveOption = Utils.el("button", { type: "button", class: "availability-toggle__option" }, [
      Utils.el("span", { html: Icons.alertCircle }),
      Utils.el("span", {}, [
        Utils.el("span", { class: "availability-toggle__title", text: Lang.t("profile.setInactive") }),
        Utils.el("span", { class: "availability-toggle__sub", text: Lang.t("profile.unavailableDesc") })
      ])
    ]);

    function paintAvailability() {
      activeOption.classList.toggle("is-selected--active", driver.availability === "active");
      inactiveOption.classList.toggle("is-selected--inactive", driver.availability !== "active");
    }
    paintAvailability();

    async function switchAvailability(target) {
      if (driver.availability === target) return;
      const confirmed = await Modal.confirm({
        title: Lang.t(target === "inactive" ? "profile.confirmInactive.title" : "profile.confirmActive.title"),
        body: Lang.t(target === "inactive" ? "profile.confirmInactive.body" : "profile.confirmActive.body"),
        danger: target === "inactive"
      });
      if (!confirmed) return;
      try {
        await Auth.updateAvailability(target);
        driver.availability = target;
        paintAvailability();
        // Also reflect the change in the plain badge up in Account Overview.
        availabilityPill.textContent = target === "active" ? Lang.t("profile.setActive") : Lang.t("profile.setInactive");
        availabilityPill.className = "status-pill status-pill--" + (target === "active" ? "success" : "neutral");
        Toast.show(Lang.t(target === "active" ? "profile.statusUpdated.active" : "profile.statusUpdated.inactive"), "success");
      } catch (err) {
        Toast.show(Lang.t("profile.statusUpdateError"), "error");
      }
    }
    activeOption.addEventListener("click", () => switchAvailability("active"));
    inactiveOption.addEventListener("click", () => switchAvailability("inactive"));

    // ---------- Logout ----------
    const logoutBtn = Utils.el("button", {
      class: "btn btn--outline-danger btn--block", html: Icons.logout + "<span>" + Lang.t("nav.logout") + "</span>",
      onClick: async () => {
        const confirmed = await Modal.confirm({ title: Lang.t("nav.logout"), body: Lang.t("profile.logoutConfirm"), confirmLabel: Lang.t("nav.logout"), danger: true });
        if (confirmed) { Auth.logout(); Router.navigate("/"); }
      }
    });

    section.appendChild(hero);
    section.appendChild(accountOverviewCard);
    section.appendChild(serviceAreasCard);
    section.appendChild(vehicleInfoCard);
    section.appendChild(profileFieldsCard);
    section.appendChild(changePasswordRow);
    section.appendChild(vehiclePhotosRow);
    section.appendChild(Utils.el("div", { class: "availability-toggle" }, [activeOption, inactiveOption]));
    section.appendChild(logoutBtn);
  }

  // ---------------------------------------------------------
  // EDIT PROFILE modal — the single, shared editor for every
  // driver-editable field (opened from any of the section "Edit"
  // buttons above). Only sends the fixed set of fields
  // Auth.updateProfile()/Code.gs's updateProfile() accept — Name,
  // Vehicle Type, Bazar, Driving Experience, photos, Username,
  // Phone, and Account Status all stay read-only by design.
  // ---------------------------------------------------------
  function openEditProfileModal(driver, onSaved) {
    const nameBnField = formField({ id: "editNameBn", labelText: Lang.t("profile.bengaliName"), value: driver.nameBn });
    const guardianField = formField({ id: "editGuardian", labelText: Lang.t("profile.guardianName"), value: driver.guardianName });
    const altPhoneField = formField({ id: "editAltPhone", labelText: Lang.t("driver.altPhone"), type: "tel", value: driver.altPhone });
    const whatsappField = formField({ id: "editWhatsapp", labelText: Lang.t("driver.whatsapp"), type: "tel", value: driver.whatsapp });
    const serviceAreaField = formField({ id: "editServiceArea", labelText: Lang.t("driver.serviceArea"), value: driver.serviceArea });
    const vehicleNumberField = formField({ id: "editVehicleNumber", labelText: Lang.t("driver.vehicleNumber"), value: driver.vehicleNumber });

    const saveBtn = Utils.el("button", { type: "submit", class: "btn btn--primary btn--block mt-5", text: Lang.t("profile.save") });

    const form = Utils.el("form", {}, [
      Utils.el("div", { class: "profile-form-grid profile-form-grid--2col" }, [nameBnField.wrap, guardianField.wrap]),
      Utils.el("div", { class: "profile-form-grid profile-form-grid--2col" }, [altPhoneField.wrap, whatsappField.wrap]),
      serviceAreaField.wrap,
      vehicleNumberField.wrap,
      saveBtn
    ]);

    const content = Utils.el("div", {}, [
      Utils.el("div", { class: "modal-head" }, [
        Utils.el("h3", { text: Lang.t("profile.editProfile") }),
        Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
      ]),
      form
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fields = {
        nameBn: Utils.clean(nameBnField.control.value),
        guardianName: Utils.clean(guardianField.control.value),
        altPhone: Utils.clean(altPhoneField.control.value),
        whatsapp: Utils.clean(whatsappField.control.value),
        serviceArea: Utils.clean(serviceAreaField.control.value),
        vehicleNumber: Utils.clean(vehicleNumberField.control.value)
      };
      const changed = Object.keys(fields).some((key) => fields[key] !== Utils.clean(driver[key] || ""));
      if (!changed) { Toast.show(Lang.t("profile.noChanges")); return; }

      saveBtn.disabled = true;
      const original = saveBtn.textContent;
      saveBtn.textContent = Lang.t("profile.saving");
      try {
        const updated = await Auth.updateProfile(fields);
        Object.assign(driver, updated);
        Modal.close();
        Toast.show(Lang.t("profile.editSuccess"), "success");
        if (onSaved) onSaved();
      } catch (err) {
        if (err.code === "SESSION_EXPIRED") {
          Toast.show(Lang.t("error.sessionExpired"), "error");
          Modal.close();
          Router.navigate("/login");
          return;
        }
        Toast.show(Lang.t("profile.editError"), "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = original;
      }
    });

    Modal.open(content);
  }

  // ---------------------------------------------------------
  // CHANGE PASSWORD modal
  // ---------------------------------------------------------
  function openChangePasswordModal() {
    const oldField = formField({ id: "oldPassword", labelText: Lang.t("profile.oldPassword"), type: "password" });
    const newField = formField({ id: "newPassword", labelText: Lang.t("profile.newPassword"), type: "password" });
    const confirmField = formField({ id: "confirmNewPassword", labelText: Lang.t("profile.confirmNewPassword"), type: "password" });

    const saveBtn = Utils.el("button", { type: "submit", class: "btn btn--primary btn--block mt-5", text: Lang.t("profile.save") });
    const form = Utils.el("form", {}, [oldField.wrap, newField.wrap, confirmField.wrap, saveBtn]);
    const root = Utils.el("div", {}, [
      Utils.el("div", { class: "modal-head" }, [
        Utils.el("h3", { text: Lang.t("profile.changePassword") }),
        Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
      ]),
      form
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      ["oldPassword", "newPassword", "confirmNewPassword"].forEach((id) => setFieldError(root, id, ""));

      const oldPassword = oldField.control.value;
      const newPassword = newField.control.value;
      const confirmPassword = confirmField.control.value;
      let valid = true;
      if (!oldPassword) { setFieldError(root, "oldPassword", Lang.t("validation.required")); valid = false; }
      if (!newPassword) { setFieldError(root, "newPassword", Lang.t("validation.required")); valid = false; }
      else if (newPassword.length < 6) { setFieldError(root, "newPassword", Lang.t("validation.passwordShort")); valid = false; }
      if (valid && newPassword !== confirmPassword) { setFieldError(root, "confirmNewPassword", Lang.t("validation.passwordMismatch")); valid = false; }
      if (!valid) return;

      saveBtn.disabled = true;
      const original = saveBtn.textContent;
      saveBtn.textContent = Lang.t("profile.saving");
      try {
        await Auth.changePassword(oldPassword, newPassword);
        Modal.close();
        Toast.show(Lang.t("profile.passwordUpdated"), "success");
      } catch (err) {
        if (err.code === "SESSION_EXPIRED") {
          Toast.show(Lang.t("error.sessionExpired"), "error");
          Modal.close();
          Router.navigate("/login");
          return;
        }
        if (err.code === "INVALID_CREDENTIALS") {
          setFieldError(root, "oldPassword", Lang.t("profile.oldPasswordWrong"));
        } else {
          Toast.show(Lang.t("error.generic"), "error");
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = original;
      }
    });

    Modal.open(root);
  }

  // ---------------------------------------------------------
  // VEHICLE PHOTOS modal — read-only gallery from the Sheet's
  // existing Vehicle Image URL column; no upload/edit here.
  // ---------------------------------------------------------
  function openVehiclePhotosModal(driver) {
    const content = Utils.el("div", {}, [
      Utils.el("div", { class: "modal-head" }, [
        Utils.el("h3", { text: Lang.t("driver.vehiclePhotos") }),
        Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
      ]),
      buildVehicleGallery(driver)
    ]);
    Modal.open(content);
  }

  Router.register("/login", renderLogin, ["/"]);
  Router.register("/profile", renderProfile, ["/"]);
})(window, document, window.Utils, window.Lang, window.Icons, window.Auth, window.Api, window.Router, window.ViewHelpers, window.Toast, window.Modal);
