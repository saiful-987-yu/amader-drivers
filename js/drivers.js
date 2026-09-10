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
      const img = Utils.el("img", { alt: driver.name, loading: "lazy", decoding: "async" });
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

  function statusNode(driver) {
    const available = driver.availability === "active";
    return Utils.el("span", {
      class: "status-dot " + (available ? "status-dot--available" : "status-dot--unavailable"),
      text: available ? Lang.t("status.available") : Lang.t("status.unavailable")
    });
  }

  function driverCard(driver, vehicleLabel, crumbTrail) {
    const card = Utils.el("div", {
      class: "driver-card", tabindex: "0", role: "button",
      "aria-label": driver.name,
      onClick: () => openDriverDetail(driver, crumbTrail),
      onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDriverDetail(driver, crumbTrail); } }
    }, [
      driverPhotoNode(driver, "small"),
      Utils.el("div", { class: "driver-card__body" }, [
        Utils.el("div", { class: "driver-card__name", text: driver.name }),
        Utils.el("div", { class: "driver-card__meta", text: (vehicleLabel ? vehicleLabel + " · " : "") + driver.serviceArea }),
        statusNode(driver),
        Utils.el("div", { class: "driver-card__actions" }, [
          Utils.el("button", {
            class: "driver-card__call-btn",
            "aria-label": Lang.t("driver.call") + " " + driver.name,
            html: Icons.phone + "<span>" + Lang.t("driver.call") + "</span>",
            disabled: driver.availability !== "active" ? "true" : null,
            onClick: (e) => driver.availability === "active" && handleCall(driver, e)
          })
        ])
      ])
    ]);
    return card;
  }

  function openDriverDetail(driver, crumbTrail) {
    const children = [];
    if (crumbTrail && crumbTrail.length) {
      const crumbNode = ViewHelpers.breadcrumb(crumbTrail.concat([{ label: driver.name }]));
      // Breadcrumb links navigate the underlying page — always close
      // this modal first so it doesn't stay stuck open on top of it.
      Utils.qsa("a", crumbNode).forEach((a) => a.addEventListener("click", () => Modal.close()));
      children.push(crumbNode);
    }
    children.push(
      Utils.el("div", { class: "modal-head" }, [
        Utils.el("h3", { text: driver.name }),
        Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
      ]),
      driverPhotoNode(driver, "large"),
      statusNode(driver),
      Utils.el("dl", { class: "detail-list mt-5" }, [
        Utils.el("dt", { text: Lang.t("driver.vehicleType") }),
        Utils.el("dd", { text: driver.vehicleType.toUpperCase() }),
        Utils.el("dt", { text: Lang.t("driver.vehicleNumber") }),
        Utils.el("dd", { text: driver.vehicleNumber || "—" }),
        Utils.el("dt", { text: Lang.t("driver.serviceArea") }),
        Utils.el("dd", { text: driver.serviceArea || "—" }),
        Utils.el("dt", { text: Lang.t("driver.experience") }),
        Utils.el("dd", { text: driver.experience ? driver.experience + " yr" : "—" }),
        Utils.el("dt", { text: Lang.t("driver.phone") }),
        Utils.el("dd", { text: driver.phone })
      ]),
      Utils.el("button", {
        class: "btn btn--call mt-5",
        html: Icons.phone + "<span>" + Lang.t("driver.call") + "</span>",
        disabled: driver.availability !== "active" ? "true" : null,
        onClick: (e) => driver.availability === "active" ? handleCall(driver, e) : null
      })
    );
    Modal.open(Utils.el("div", {}, children));
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
        Utils.el("button", {
          class: "btn btn--primary", text: Lang.t("hero.cta"),
          onClick: () => Router.navigate("/markets")
        })
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

  function marketGrid(markets, onSelect) {
    if (!markets.length) return ViewHelpers.emptyBlock({ message: Lang.t("market.empty") });
    return Utils.el("div", { class: "chip-grid" }, markets.map((m) =>
      Utils.el("button", { class: "chip-card", onClick: () => onSelect(m) }, [
        Utils.el("div", { class: "chip-card__icon", html: Icons.map }),
        Utils.el("div", { class: "chip-card__name", text: marketName(m) })
      ])
    ));
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

    function buildBody(market, vehicles) {
      return vehicles.length
        ? Utils.el("div", { class: "chip-grid" }, vehicles.map((v) =>
            Utils.el("button", { class: "chip-card", onClick: () => Router.navigate(`/drivers/${market.slug}/${v.slug}`) }, [
              Utils.el("div", { class: "chip-card__icon", html: Icons.vehicle(v.slug) }),
              Utils.el("div", { class: "chip-card__name", text: vehicleName(v) })
            ])
          ))
        : ViewHelpers.emptyBlock({ message: Lang.t("vehicle.empty") });
    }

    // If we already know the market slug is invalid we still need a
    // network round trip once to find out — but if markets are cached
    // we can validate synchronously and avoid a flash of the wrong UI.
    const knownMarket = cachedMarkets && cachedMarkets.find((m) => m.slug === params.market);

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
      (knownMarket && cachedVehicles) ? buildBody(knownMarket, cachedVehicles) : ViewHelpers.loadingBlock(Lang.t("vehicle.loading"))
    ]);
    app.appendChild(section);

    if (knownMarket && cachedVehicles) return;

    try {
      const [markets, vehicles] = await Promise.all([Api.getMarkets(), Api.getVehicleCategories()]);
      const market = markets.find((m) => m.slug === params.market);
      if (!market) { Router.navigate("/markets"); return; }

      const freshCrumb = ViewHelpers.breadcrumb([
        { label: Lang.t("nav.home"), path: "/" },
        { label: marketName(market) }
      ]);
      section.replaceChild(freshCrumb, section.firstChild);
      section.querySelector("[data-market-sub]").textContent = Lang.t("vehicle.chooseSub", { market: marketName(market) });
      section.replaceChild(buildBody(market, vehicles), section.lastChild);
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

  Router.register("/", renderHome);
  Router.register("/markets", renderMarkets);
  Router.register("/vehicles/:market", renderVehicles);
  Router.register("/drivers/:market/:vehicle", renderDriverList);
  Router.register("/search", renderSearch);
})(window, document, window.Utils, window.Lang, window.Icons, window.Api, window.Router, window.ViewHelpers, window.Modal, window.Toast, window.Search);
