/**
 * pwa-install.js — the custom "Install app" banner + the "new version
 * ready" banner. Both reuse the same #pwa-install-banner element (see
 * index.html), since they're never needed at the same moment in
 * practice: install is for a first-time visitor, update-ready is for a
 * returning one who already has the app installed/cached.
 *
 * INSTALL BANNER
 * ---------------
 * Chrome/Edge/Samsung Internet on Android fire "beforeinstallprompt"
 * when this site qualifies as installable (manifest + service worker in
 * place). The browser's own address-bar install icon is easy to miss,
 * especially for less tech-savvy users and on older phones/launchers —
 * so this listens for that event, stops the browser's own mini-prompt,
 * and shows this site's own on-brand banner with a big "Install" button
 * instead. iOS Safari never fires this event at all (Apple doesn't
 * support it) — there, a simple "Share -> Add to Home Screen"
 * instruction banner is shown instead, since no programmatic install is
 * possible there.
 *
 * A dismissed banner stays hidden for DISMISS_COOLDOWN_DAYS so it never
 * nags on every single visit.
 *
 * UPDATE-READY BANNER
 * --------------------
 * sw.js uses skipWaiting()/clients.claim(), so a new version can finish
 * installing while someone already has the app open. This listens for
 * that and offers a one-tap Refresh instead of the person only finding
 * out something changed on their next natural reload.
 */
(function (window, document, Utils, Lang) {
  "use strict";

  const STORAGE_DISMISS_INSTALL = "nobi.pwa.installDismissedAt";
  const STORAGE_DISMISS_IOS = "nobi.pwa.iosDismissedAt";
  const DISMISS_COOLDOWN_DAYS = 14;

  const banner = document.getElementById("pwa-install-banner");
  if (!banner) return;

  let deferredPrompt = null;
  let mode = null; // "install" | "ios" | "update" | null

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !window.MSStream;
  }

  function withinCooldown(storageKey) {
    const last = Utils.storage.get(storageKey, null);
    if (!last) return false;
    const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return days < DISMISS_COOLDOWN_DAYS;
  }

  function hide() {
    banner.hidden = true;
    banner.innerHTML = "";
    banner.classList.remove("pwa-install-banner--update");
    mode = null;
  }

  function renderInstall() {
    mode = "install";
    banner.classList.remove("pwa-install-banner--update");
    banner.innerHTML = "";
    banner.appendChild(Utils.el("div", { class: "pwa-install-banner__icon" }, [
      Utils.el("img", { src: "assets/brand/pwa-icon-192.png", alt: "" })
    ]));
    const closeBtn = Utils.el("button", {
      type: "button", class: "pwa-install-banner__close", "aria-label": Lang.t("pwa.install.dismiss"),
      html: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      onClick: () => { Utils.storage.set(STORAGE_DISMISS_INSTALL, Date.now()); hide(); }
    });
    const installBtn = Utils.el("button", { type: "button", class: "btn btn--primary", text: Lang.t("pwa.install.action") });
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) { hide(); return; }
      installBtn.disabled = true;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      if (!choice || choice.outcome !== "accepted") {
        Utils.storage.set(STORAGE_DISMISS_INSTALL, Date.now());
      }
      hide();
    });
    banner.appendChild(Utils.el("div", { class: "pwa-install-banner__body" }, [
      Utils.el("div", { class: "pwa-install-banner__title", text: Lang.t("pwa.install.title") }),
      Utils.el("div", { class: "pwa-install-banner__text", text: Lang.t("pwa.install.body") }),
      Utils.el("div", { class: "pwa-install-banner__actions" }, [installBtn])
    ]));
    banner.appendChild(closeBtn);
    banner.hidden = false;
  }

  function renderIos() {
    mode = "ios";
    banner.classList.remove("pwa-install-banner--update");
    banner.innerHTML = "";
    banner.appendChild(Utils.el("div", { class: "pwa-install-banner__icon" }, [
      Utils.el("img", { src: "assets/brand/pwa-icon-192.png", alt: "" })
    ]));
    const closeBtn = Utils.el("button", {
      type: "button", class: "pwa-install-banner__close", "aria-label": Lang.t("pwa.install.dismiss"),
      html: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      onClick: () => { Utils.storage.set(STORAGE_DISMISS_IOS, Date.now()); hide(); }
    });
    banner.appendChild(Utils.el("div", { class: "pwa-install-banner__body" }, [
      Utils.el("div", { class: "pwa-install-banner__title", text: Lang.t("pwa.install.iosTitle") }),
      Utils.el("div", { class: "pwa-install-banner__text", text: Lang.t("pwa.install.iosBody") })
    ]));
    banner.appendChild(closeBtn);
    banner.hidden = false;
  }

  function renderUpdateReady(onRefresh) {
    mode = "update";
    banner.classList.add("pwa-install-banner--update");
    banner.innerHTML = "";
    const refreshBtn = Utils.el("button", { type: "button", class: "btn btn--primary", text: Lang.t("pwa.updateReady.action") });
    refreshBtn.addEventListener("click", onRefresh);
    banner.appendChild(Utils.el("div", { class: "pwa-install-banner__body" }, [
      Utils.el("div", { class: "pwa-install-banner__title", text: Lang.t("pwa.install.title") }),
      Utils.el("div", { class: "pwa-install-banner__text", text: Lang.t("pwa.updateReady.body") }),
      Utils.el("div", { class: "pwa-install-banner__actions" }, [refreshBtn])
    ]));
    banner.hidden = false;
  }

  // Re-render whatever's currently showing in the new language, same
  // pattern the rest of the app uses for dynamic (non-[data-i18n]) text.
  document.addEventListener("nobi:languagechange", () => {
    if (mode === "install") renderInstall();
    else if (mode === "ios") renderIos();
    // "update" mode's refresh handler is re-created fresh each render
    // elsewhere (its listener is attached once in initServiceWorkerWatch),
    // so it's deliberately left alone here rather than rebuilt without one.
  });

  // ---- Android/Chrome/Edge/Samsung Internet: native install prompt ----
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (isStandalone() || withinCooldown(STORAGE_DISMISS_INSTALL)) return;
    renderInstall();
  });

  window.addEventListener("appinstalled", () => {
    Utils.storage.set(STORAGE_DISMISS_INSTALL, Date.now());
    hide();
  });

  // ---- iOS Safari: beforeinstallprompt never fires, show instructions instead ----
  if (isIos() && !isStandalone() && !withinCooldown(STORAGE_DISMISS_IOS)) {
    renderIos();
  }

  // ---- Update-ready: a new Service Worker finished installing while this tab was open ----
  window.addEventListener("nobi:swregistered", (event) => {
    const reg = event.detail && event.detail.registration;
    if (!reg) return;
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // "installed" + an existing controller means this is a genuine
        // update (not the very first install with nothing to replace).
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          renderUpdateReady(() => window.location.reload());
        }
      });
    });
  });
})(window, document, window.Utils, window.Lang);
