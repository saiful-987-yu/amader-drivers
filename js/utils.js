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

  window.Utils = Utils;
})(window);
