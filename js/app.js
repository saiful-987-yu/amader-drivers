/**
 * app.js — application shell: hash router, toast notifications,
 * modal/confirm dialogs, and header/nav wiring. Individual
 * screens are registered into the `Router.routes` table by
 * drivers.js, registration.js and profile.js.
 */
(function (window, document, Utils, Lang, Theme, Icons) {
  "use strict";

  // ---------------------------------------------------------
  // TOASTS
  // ---------------------------------------------------------
  const Toast = {};
  Toast.show = function (message, type) {
    const region = Utils.qs("#toast-region");
    if (!region) return;
    const node = Utils.el("div", {
      class: "toast" + (type ? " toast--" + type : ""),
      role: "status"
    }, [document.createTextNode(message)]);
    region.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transition = "opacity 200ms ease";
      setTimeout(() => node.remove(), 220);
    }, 3200);
  };
  window.Toast = Toast;

  // ---------------------------------------------------------
  // MODAL (used for driver details bottom sheet + confirmations)
  // ---------------------------------------------------------
  const Modal = {};
  let activeOverlay = null;
  let lastFocused = null;
  let activeOnClose = null;

  Modal.open = function (contentNode, opts) {
    Modal.close();
    lastFocused = document.activeElement;
    const overlay = Utils.el("div", { class: "modal-overlay", role: "presentation" });
    const sheet = Utils.el("div", { class: "modal-sheet", role: "dialog", "aria-modal": "true" }, [contentNode]);
    overlay.appendChild(sheet);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay && !(opts && opts.persistent)) Modal.close();
    });
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    activeOnClose = (opts && opts.onClose) || null;
    const focusable = sheet.querySelector("button, [href], input, select, textarea, [tabindex]");
    if (focusable) focusable.focus();
    document.addEventListener("keydown", onKeydown);
    return overlay;
  };

  function onKeydown(e) {
    if (e.key === "Escape") Modal.close();
  }

  Modal.close = function () {
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
      document.removeEventListener("keydown", onKeydown);
      if (lastFocused && lastFocused.focus) lastFocused.focus();
      const cb = activeOnClose;
      activeOnClose = null;
      if (cb) cb();
    }
  };

  Modal.confirm = function ({ title, body, confirmLabel, cancelLabel, danger }) {
    return new Promise((resolve) => {
      const content = Utils.el("div", {}, [
        Utils.el("div", { class: "modal-head" }, [
          Utils.el("h3", { text: title }),
          Utils.el("button", {
            class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"),
            html: Icons.close, onClick: () => { Modal.close(); resolve(false); }
          })
        ]),
        Utils.el("p", { text: body }),
        Utils.el("div", { class: "confirm-actions" }, [
          Utils.el("button", {
            class: "btn btn--ghost", text: cancelLabel || Lang.t("action.cancel"),
            onClick: () => { Modal.close(); resolve(false); }
          }),
          Utils.el("button", {
            class: "btn " + (danger ? "btn--danger" : "btn--primary"),
            text: confirmLabel || Lang.t("action.confirm"),
            onClick: () => { Modal.close(); resolve(true); }
          })
        ])
      ]);
      Modal.open(content);
    });
  };
  window.Modal = Modal;

  // ---------------------------------------------------------
  // SHARED VIEW HELPERS (used by drivers.js, registration.js, profile.js)
  // ---------------------------------------------------------
  const ViewHelpers = {};

  ViewHelpers.loadingBlock = function (message) {
    return Utils.el("div", { class: "state-block", role: "status" }, [
      Utils.el("div", { class: "skeleton-grid" }, [
        Utils.el("div", { class: "skeleton-card" }),
        Utils.el("div", { class: "skeleton-card" }),
        Utils.el("div", { class: "skeleton-card" })
      ]),
      Utils.el("p", { text: message || Lang.t("loading.generic"), class: "mt-5" })
    ]);
  };

  ViewHelpers.errorBlock = function (message, onRetry) {
    return Utils.el("div", { class: "state-block" }, [
      Utils.el("div", { class: "state-block__icon", html: Icons.alertCircle }),
      Utils.el("h3", { text: message || Lang.t("error.network") }),
      Utils.el("button", { class: "btn btn--primary", text: Lang.t("action.retry"), onClick: onRetry })
    ]);
  };

  ViewHelpers.emptyBlock = function ({ message, sub, actionLabel, onAction, icon }) {
    const children = [
      Utils.el("div", { class: "state-block__icon", html: icon || Icons.empty }),
      Utils.el("h3", { text: message })
    ];
    if (sub) children.push(Utils.el("p", { text: sub }));
    if (actionLabel && onAction) {
      children.push(Utils.el("button", { class: "btn btn--ghost", text: actionLabel, onClick: onAction }));
    }
    return Utils.el("div", { class: "state-block" }, children);
  };

  /**
   * Compact, clickable breadcrumb trail. `items` is an array of
   * { label, path } — the last item renders as the non-clickable
   * current page. Pass no path on an item to force it non-clickable.
   */
  ViewHelpers.breadcrumb = function (items) {
    const ol = Utils.el("ol", { class: "breadcrumb__list" });
    items.forEach((item, idx) => {
      const isLast = idx === items.length - 1;
      const li = Utils.el("li", { class: "breadcrumb__item" });
      if (item.path && !isLast) {
        li.appendChild(Utils.el("a", { href: "#" + item.path, class: "breadcrumb__link", text: item.label }));
      } else {
        li.appendChild(Utils.el("span", {
          class: "breadcrumb__current", text: item.label,
          "aria-current": isLast ? "page" : null
        }));
      }
      ol.appendChild(li);
      if (!isLast) ol.appendChild(Utils.el("li", { class: "breadcrumb__sep", "aria-hidden": "true", text: "\u203A" }));
    });
    return Utils.el("nav", { class: "breadcrumb", "aria-label": "Breadcrumb" }, [ol]);
  };

  window.ViewHelpers = ViewHelpers;

  // ---------------------------------------------------------
  // ROUTER
  // ---------------------------------------------------------
  const Router = { routes: [] };

  /** Register a route. pattern uses ":name" segments, e.g. "/drivers/:market/:vehicle" */
  Router.register = function (pattern, renderFn) {
    const paramNames = [];
    const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, (m) => {
      paramNames.push(m.slice(1));
      return "([^/]+)";
    }) + "$");
    Router.routes.push({ regex, paramNames, renderFn });
  };

  Router.navigate = function (path) {
    window.location.hash = "#" + path;
  };

  function currentPath() {
    const hash = window.location.hash || "#/";
    return hash.slice(1) || "/";
  }

  async function renderRoute() {
    const path = currentPath();
    const [rawPath, queryString] = path.split("?");
    const query = {};
    if (queryString) {
      queryString.split("&").forEach((pair) => {
        const [k, v] = pair.split("=");
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || "");
      });
    }

    const app = Utils.qs("#app");
    if (!app) return;

    for (const route of Router.routes) {
      const match = rawPath.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
        app.setAttribute("aria-busy", "true");
        try {
          await route.renderFn(app, params, query);
        } catch (err) {
          console.error(err);
          app.innerHTML = "";
          app.appendChild(ViewHelpers.errorBlock(Lang.t("error.generic"), () => renderRoute()));
        }
        app.setAttribute("aria-busy", "false");
        window.scrollTo({ top: 0, behavior: "auto" });
        highlightNav(rawPath);
        closeMobileMenu();
        return;
      }
    }
    // No match — fall back to home.
    Router.navigate("/");
  }

  function highlightNav(rawPath) {
    Utils.qsa("[data-nav-link]").forEach((link) => {
      const target = link.getAttribute("data-nav-link");
      const isCurrent = target === "/" ? rawPath === "/" : rawPath.startsWith(target);
      link.classList.toggle("is-current", isCurrent);
    });
  }

  window.addEventListener("hashchange", renderRoute);
  window.Router = Router;

  // ---------------------------------------------------------
  // HEADER / NAV WIRING
  // ---------------------------------------------------------
  function closeMobileMenu() {
    const nav = Utils.qs("#mobile-nav");
    const toggle = Utils.qs("#menu-toggle");
    if (nav) nav.classList.remove("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function wireHeader() {
    const menuToggle = Utils.qs("#menu-toggle");
    const mobileNav = Utils.qs("#mobile-nav");
    if (menuToggle && mobileNav) {
      menuToggle.addEventListener("click", () => {
        const isOpen = mobileNav.classList.toggle("is-open");
        menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
    }

    Utils.qsa("[data-lang-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => Lang.setLanguage(btn.getAttribute("data-lang-toggle")));
    });

    Utils.qsa("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => Theme.toggle());
      btn.setAttribute("aria-pressed", Theme.current() === "dark" ? "true" : "false");
    });

    document.addEventListener("nobi:authchange", updateAuthNav);
    updateAuthNav();
  }

  function updateAuthNav() {
    const loggedIn = window.Auth && window.Auth.isLoggedIn();
    Utils.qsa("[data-auth-link]").forEach((link) => {
      const showWhen = link.getAttribute("data-auth-link");
      const shouldShow = showWhen === "loggedIn" ? loggedIn : !loggedIn;
      link.style.display = shouldShow ? "" : "none";
    });
  }

  // ---------------------------------------------------------
  // INIT
  // ---------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    wireHeader();
    Lang.apply();
    // Fire-and-forget: Markets load first, then Vehicle Categories
    // and the Driver directory start preloading in the background
    // (see Api.preload in api.js). renderRoute() below does NOT
    // wait on this — the current view fetches/awaits normally and
    // simply hits the same cached promise if preload got there first.
    if (window.Api && window.Api.preload) window.Api.preload().catch(() => {});
    renderRoute();
  });

  document.addEventListener("nobi:languagechange", () => {
    // Re-render current view so dynamic content (not just static
    // [data-i18n] nodes) picks up the new language immediately.
    renderRoute();
  });
})(window, document, window.Utils, window.Lang, window.Theme, window.Icons);
