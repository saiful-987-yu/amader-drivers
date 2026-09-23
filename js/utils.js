/**
 * utils.js — small, dependency-free helper functions shared by
 * every other module. No UI logic and no data logic lives here.
 */
(function (window) {
  "use strict";

  const Utils = {};

  /** Query-select shorthand. */
  Utils.qs = (sel, root) => (root || document).querySelector(sel);
  Utils.qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Create an element with attributes/children in one call. */
  Utils.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach((key) => {
      if (key === "class") node.className = attrs[key];
      else if (key === "text") node.textContent = attrs[key];
      else if (key === "html") node.innerHTML = attrs[key];
      else if (key.startsWith("on") && typeof attrs[key] === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
      } else if (attrs[key] !== null && attrs[key] !== undefined) {
        node.setAttribute(key, attrs[key]);
      }
    });
    (children || []).forEach((child) => {
      if (child) node.appendChild(child);
    });
    return node;
  };

  /** Debounce a function by a given delay (ms). */
  Utils.debounce = function (fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  /** Normalize a phone number for tel: links and comparisons. */
  Utils.normalizePhone = function (raw) {
    if (!raw) return "";
    let value = String(raw).trim().replace(/[^\d+]/g, "");
    if (value.startsWith("+880")) return value;
    if (value.startsWith("880")) return "+" + value;
    if (value.startsWith("0") && value.length === 11) return "+88" + value;
    if (/^\d{10}$/.test(value)) return "+880" + value;
    return value;
  };

  /** Validate a Bangladeshi mobile number loosely (01XXXXXXXXX or +8801XXXXXXXXX). */
  Utils.isValidBdPhone = function (raw) {
    if (!raw) return false;
    const digits = String(raw).replace(/[^\d]/g, "");
    // Accepts 01XXXXXXXXX (11 digits) or 8801XXXXXXXXX (13 digits)
    if (/^01[3-9]\d{8}$/.test(digits)) return true;
    if (/^8801[3-9]\d{8}$/.test(digits)) return true;
    return false;
  };

  /** Escape a string for safe insertion as text (defense in depth; we mostly use textContent). */
  Utils.escapeHtml = function (str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  };

  /** Try to turn a Google Drive share link into a direct-view image URL. */
  Utils.resolveImageUrl = function (url) {
    if (!url) return "";
    const trimmed = String(url).trim();
    if (!trimmed) return "";
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
      trimmed.match(/[?&]id=([^&]+)/);
    if (trimmed.includes("drive.google.com") && driveMatch && driveMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}=w600`;
    }
    return trimmed;
  };

  /** Simple UID for client-side temporary keys. */
  Utils.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  /** Read/write JSON from localStorage safely. */
  Utils.storage = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* storage may be unavailable — fail silently, it is non-critical */
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    }
  };

  /**
   * The driver's display name for the CURRENT language: Bengali Name
   * when the site is in বাংলা mode and one is set, otherwise always the
   * English Name — a driver never shows with a blank name.
   */
  Utils.driverDisplayName = function (driver) {
    if (!driver) return "";
    const isBn = window.Lang && window.Lang.current() === "bn";
    return (isBn && driver.nameBn) ? driver.nameBn : driver.name;
  };

  /** Trim + collapse internal whitespace, tolerating null/undefined. */
  Utils.clean = function (value) {
    return (value == null ? "" : String(value)).trim().replace(/\s+/g, " ");
  };

  /** Build a wa.me deep link from a raw phone number, reusing the same normalization as tel: links. */
  Utils.waLink = function (raw) {
    const normalized = Utils.normalizePhone(raw);
    return "https://wa.me/" + normalized.replace(/^\+/, "");
  };

  /**
   * Resolve which number (if any) the WhatsApp button should use, per the
   * Sheet's "WhatsApp" column: F = main phone, A = alternative phone,
   * N/empty = no button, anything else = used directly as the WhatsApp number.
   * Returns null when there is no valid number to use.
   */
  Utils.resolveWhatsApp = function (driver) {
    const raw = Utils.clean(driver && driver.whatsapp);
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (upper === "N" || raw === "নাই" || raw === "না") return null;
    if (upper === "F") return driver.phone ? driver.phone : null;
    if (upper === "A") return driver.altPhone ? driver.altPhone : null;
    return raw;
  };

  /** Round a raw star-rating value (possibly decimal, possibly empty) to a 0-5 whole-star count. */
  Utils.starCount = function (raw) {
    const num = parseFloat(raw);
    if (isNaN(num)) return 0;
    return Math.min(5, Math.max(0, Math.round(num)));
  };

  /**
   * Split a comma-separated Sheet cell (e.g. "Nobi Bazar, Bangla Bazar" or
   * "cng, auto") into a trimmed array of individual values. A single plain
   * value (no comma) still works exactly as before — it just becomes a
   * one-item array — so existing single-value data needs no migration.
   */
  Utils.splitMulti = function (raw) {
    if (!raw) return [];
    return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  };

  /**
   * A live clone of the site's own <footer class="site-footer"> (see
   * index.html) — used at the very bottom of the Driver/Doctor Details
   * modal, per the "Personal Details / Rating / Video / Website
   * Footer" page order, so Details always ends with the EXACT same
   * footer as every other page: same brand/nav links, same social
   * icons from config/config.js's SOCIAL_LINKS (including the
   * WhatsApp-number-to-wa.me conversion), same copyright line. Left
   * out here only: the outer `.container` wrapper (the modal already
   * has its own side padding, and `.site-footer` itself already has
   * zero horizontal padding of its own) and the language toggle,
   * since switching language doesn't re-render an already-open modal
   * (same limitation the rest of this modal's text already has).
   */
  Utils.buildFooterClone = function () {
    const Lang = window.Lang;
    const Icons = window.Icons;
    const isLoggedIn = window.Auth && window.Auth.isLoggedIn();

    const nav = Utils.el("nav", { class: "footer-nav", "aria-label": "Footer" }, [
      Utils.el("a", { href: "#/markets", text: Lang.t("nav.drivers") }),
      Utils.el("a", { href: "#/registration", text: Lang.t("nav.register") }),
      isLoggedIn
        ? Utils.el("a", { href: "#/profile", text: Lang.t("nav.profile") })
        : Utils.el("a", { href: "#/login", text: Lang.t("nav.login") })
    ]);

    const brandMark = Utils.el("span", { class: "brand__mark brand__mark--sm", "aria-hidden": "true" });
    const brandImg = Utils.el("img", { src: "assets/brand/logo-low.png", alt: "", style: "width:100%;height:100%;object-fit:contain;border-radius:inherit;" });
    brandImg.addEventListener("error", () => { brandMark.innerHTML = Icons.logo; });
    brandMark.appendChild(brandImg);
    const brand = Utils.el("a", { class: "footer-brand", href: "#/" }, [
      brandMark,
      Utils.el("span", { text: Lang.t("site.name") })
    ]);

    const socialNav = Utils.el("nav", { class: "footer-social", "aria-label": "Social media" });
    const socialCfg = (window.NOBI_CONFIG && window.NOBI_CONFIG.SOCIAL_LINKS) || {};
    [
      { key: "facebook", icon: Icons.facebook, labelKey: "footer.facebook" },
      { key: "whatsapp", icon: Icons.whatsapp, labelKey: "footer.whatsapp" },
      { key: "tiktok", icon: Icons.tiktok, labelKey: "footer.tiktok" },
      { key: "linkedin", icon: Icons.linkedin, labelKey: "footer.linkedin" }
    ].forEach((p) => {
      let href = socialCfg[p.key] || "#";
      if (p.key === "whatsapp" && href !== "#") href = Utils.waLink(href);
      socialNav.appendChild(Utils.el("a", { href, target: "_blank", rel: "noopener", "aria-label": Lang.t(p.labelKey), html: p.icon }));
    });

    const bottomRow = Utils.el("div", { class: "footer-row footer-row--bottom" }, [
      Utils.el("span", { text: "© " + new Date().getFullYear() + " " + Lang.t("site.name") + " · " + Lang.t("footer.rights") }),
      socialNav
    ]);

    return Utils.el("footer", { class: "site-footer" }, [
      Utils.el("div", { class: "footer-compact" }, [
        Utils.el("div", { class: "footer-row footer-row--top" }, [brand, nav]),
        bottomRow
      ])
    ]);
  };

  /**
   * Turns a YouTube or Google Drive video URL into an embeddable
   * iframe src, or null for anything else/empty/unrecognized — used
   * by the Driver/Doctor Details page's Video section, which must stay
   * completely hidden (heading included) unless this returns a URL.
   */
  Utils.videoEmbedUrl = function (rawUrl) {
    const url = Utils.clean(rawUrl);
    if (!url) return null;

    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
    if (ytMatch && ytMatch[1]) return "https://www.youtube.com/embed/" + ytMatch[1];

    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
    if (url.indexOf("drive.google.com") !== -1 && driveMatch && driveMatch[1]) {
      return "https://drive.google.com/file/d/" + driveMatch[1] + "/preview";
    }

    return null;
  };

  /**
   * The Video section itself — a 16:9 embedded player, or null if the
   * URL is empty/unsupported (checked immediately, so an invalid URL
   * never even attempts to load). No fixed timeout: the section starts
   * completely hidden (see .video-section.is-loading in style.css) and
   * is revealed the moment the iframe's own `load` event actually
   * fires — whether that's 3 seconds or 3 minutes later, on however
   * slow a connection. The Details page itself is never blocked
   * waiting for this. If the video never loads (private/deleted/
   * blocked), the section just stays hidden indefinitely — never an
   * empty header or box.
   */
  Utils.buildVideoSection = function (rawUrl, titleText) {
    const embedUrl = Utils.videoEmbedUrl(rawUrl);
    if (!embedUrl) return null;

    const iframe = Utils.el("iframe", {
      // NOT loading="lazy" — this section starts hidden (display:none)
      // until the iframe's own `load` event fires, and a lazy iframe
      // never even starts fetching while it has no layout box (i.e.
      // while its ancestor is display:none), so `load` would never
      // fire and the section would stay hidden forever. Loading it
      // eagerly in the background is exactly what lets it reveal
      // itself the moment it's actually ready.
      src: embedUrl, title: titleText, frameborder: "0", allowfullscreen: "true",
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    });
    const section = Utils.el("div", { class: "video-section is-loading" }, [
      Utils.el("h3", { class: "detail-section-title", text: titleText }),
      Utils.el("div", { class: "video-embed" }, [iframe])
    ]);

    iframe.addEventListener("load", () => { section.classList.remove("is-loading"); });

    return section;
  };

  /**
   * Click-to-speak, using only the browser's own built-in Speech
   * Synthesis — no external API, no recording/storage of anything.
   * Never auto-plays; only ever called from an explicit click handler.
   * Cancels any currently-playing utterance first so rapid taps don't
   * queue up and overlap. On a browser with no speech support at all,
   * this silently does nothing rather than throwing.
   */
  Utils.speak = function (text, lang) {
    const clean = Utils.clean(text);
    if (!clean || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = lang === "bn" ? "bn-BD" : "en-US";
      window.speechSynthesis.speak(utter);
    } catch (err) {
      /* Speech synthesis is a nice-to-have — never let a failure here affect anything else. */
    }
  };

  window.Utils = Utils;
})(window);
