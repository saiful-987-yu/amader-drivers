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

  /**
   * Try to turn a Google Drive share link into a direct-view image URL.
   * Matches every common share-link shape Drive produces (share dialog
   * "/file/d/ID/view", "docs.google.com/.../d/ID/...", and any link
   * carrying "?id=..." or "&id=..."), not just one specific pattern.
   * Returns the first (most reliable) of driveImageCandidates() below.
   */
  Utils.resolveImageUrl = function (url) {
    if (!url) return "";
    const trimmed = String(url).trim();
    if (!trimmed) return "";
    const candidates = Utils.driveImageCandidates(trimmed);
    return candidates.length ? candidates[0] : trimmed;
  };

  /** Extracts just the Drive file ID from any Drive share-link shape, or "" if this isn't a Drive link. */
  Utils.driveFileId = function (url) {
    const trimmed = String(url || "").trim();
    if (!trimmed || !/drive\.google\.com|docs\.google\.com/.test(trimmed)) return "";
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    return match ? match[1] : "";
  };

  /**
   * All the direct-image URL formats worth trying for one Google Drive
   * file, most-reliable first. Google has been tightening hotlinking
   * over time (the old "drive.google.com/uc?export=view" link is now
   * widely blocked for embedding on outside sites), so this always
   * tries the "/thumbnail" endpoint — Google's own embedding/thumbnail
   * service — first, then falls back through the older formats that
   * still work for some files/accounts. Empty array if this isn't a
   * Drive link at all (a plain direct image URL never needs any of this).
   */
  Utils.driveImageCandidates = function (url) {
    const id = Utils.driveFileId(url);
    if (!id) return [];
    return [
      `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
      `https://lh3.googleusercontent.com/d/${id}`,
      `https://drive.google.com/uc?export=view&id=${id}`
    ];
  };

  /**
   * Local Drive-photo cache (IndexedDB), separate from the browser's own
   * HTTP cache — this is what makes a driver/vehicle/doctor photo survive
   * things like a phone's "Clean/boost" app clearing browser cache,
   * since IndexedDB is treated as this site's own app data, not cache.
   *
   * DESIGN — kept 100% additive on purpose, after the earlier lesson
   * that any image-loading change that can ITSELF block a photo from
   * showing is too risky here:
   *   - Reading a cached photo (get) never touches the network at all.
   *   - Writing (put) only ever happens quietly in the background,
   *     AFTER a photo has already displayed successfully the normal way
   *     — so a failed/blocked write can never affect what's on screen.
   *   - Whether writing even works depends on Google's Drive/thumbnail
   *     hosts allowing a cross-origin fetch() read (CORS) — some do,
   *     some may not. If not, put() below simply never succeeds and
   *     the site behaves exactly as it does today (ordinary browser
   *     HTTP cache only) — there is no failure mode that makes things
   *     worse than that.
   */
  Utils.photoCache = (function () {
    const DB_NAME = "amader-photo-cache";
    const DB_VERSION = 1;
    const STORE = "photos";
    const MAX_BLOB_BYTES = 8 * 1024 * 1024; // safety cap — real driver/vehicle/doctor photos are always far smaller
    let dbPromise = null;

    function openDb() {
      if (!window.indexedDB) return Promise.resolve(null);
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        let req;
        try {
          req = window.indexedDB.open(DB_NAME, DB_VERSION);
        } catch (e) { resolve(null); return; }
        req.onupgradeneeded = () => {
          try {
            if (!req.result.objectStoreNames.contains(STORE)) {
              req.result.createObjectStore(STORE, { keyPath: "url" });
            }
          } catch (e) { /* ignore — worst case, get/put below just fail closed */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      return dbPromise;
    }

    /** Resolves the cached Blob for this photo's original (sheet) URL, or null. Never rejects, never touches the network. */
    function get(url) {
      return openDb().then((db) => {
        if (!db) return null;
        return new Promise((resolve) => {
          try {
            const req = db.transaction(STORE, "readonly").objectStore(STORE).get(url);
            req.onsuccess = () => resolve(req.result ? req.result.blob : null);
            req.onerror = () => resolve(null);
          } catch (e) { resolve(null); }
        });
      }).catch(() => null);
    }

    /** Best-effort save; silently does nothing on any failure (quota, no IndexedDB support, etc.). */
    function put(url, blob) {
      if (!blob || !blob.size || blob.size > MAX_BLOB_BYTES) return Promise.resolve();
      return openDb().then((db) => {
        if (!db) return;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put({ url, blob, savedAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (e) { resolve(); }
        });
      }).catch(() => {});
    }

    return { get, put };
  })();

  /**
   * Once a cross-origin fetch() of a Drive photo fails (almost always
   * because that host doesn't send CORS headers allowing script to read
   * the bytes), it will keep failing for every other Drive photo too —
   * so this remembers that after the first failure, instead of spending
   * a second, doomed network request on every single photo forever.
   * Reset to false the moment any attempt actually succeeds.
   */
  const CORS_BACKFILL_BLOCKED_KEY = "nobi.photoCache.corsBlocked";

  /**
   * Wires an <img>'s load-failure handling so a real photo is NEVER
   * permanently given up on early. On a genuine failure (never "still
   * loading" — the browser only raises "error" once a request has
   * actually finished failing):
   *   1. First checks the local photo cache (IndexedDB, see
   *      Utils.photoCache above) — a hit shows the photo instantly with
   *      no network at all, and survives things a phone's cache-cleaner
   *      would otherwise wipe.
   *   2. On a cache miss, cycles through every direct-URL format for
   *      this Drive file (see driveImageCandidates above) immediately,
   *      since a wrong/blocked format fails fast and the next is worth
   *      trying right away.
   *   3. Once every format has failed once, this KEEPS RETRYING the
   *      same formats with growing gaps (2s, 5s, 10s, 20s, 30s) for
   *      about a minute — because a large/older photo can genuinely
   *      just take Google's Drive-preview service a while to generate
   *      on a device/browser that has never fetched it before (this is
   *      exactly what was seen: a heavy old photo failed instantly on a
   *      brand-new phone/browser but worked fine once already visited).
   *      A photo is only given up on (onFallback, i.e. the placeholder
   *      icon) after this whole run of retries has genuinely failed.
   *   4. The moment a photo displays successfully over the network (not
   *      from the local cache), a background attempt quietly tries to
   *      save its real bytes into the local cache for next time — see
   *      Utils.photoCache's own comment for why this can never affect
   *      what's on screen even if it fails.
   *   5. Stops retrying on its own once the <img> is no longer on
   *      screen (img.isConnected false — e.g. its card was removed by a
   *      list re-render), so this never keeps a removed card's photo
   *      quietly retrying forever in the background.
   * This function now sets img.src itself (callers should NOT set it
   * beforehand) so it can check the local cache before ever touching
   * the network.
   *
   * VISUAL NOTE: while candidates are being tried/retried, the <img>
   * has no valid picture yet, and a browser's OWN default behaviour is
   * to draw a small "broken image" glyph inside it the instant a src
   * fails — before our retry has even set the next candidate. With
   * several retries firing close together this glyph flashes in and
   * out, which reads as the whole placeholder "jumping"/flickering.
   * To prevent that, the <img> is kept invisible (opacity: 0) for as
   * long as it has no successfully-loaded photo, and is only faded in
   * once a "load" event actually fires — so every failed attempt stays
   * silent (just the card's own background box) and the photo simply
   * appears, once, the moment it's really ready.
   *
   * LOCAL FIXTURE (optional 4th argument, localUrl): for the bounded,
   * developer-curated set of images — Market photo, Market background,
   * Vehicle-category photo — a same-origin file bundled straight into
   * the GitHub repo (see Utils.localFixtureUrl below) is tried FIRST,
   * before anything else. A same-origin file needs none of the Drive
   * chain's retries — either it exists (near-instant) or it 404s
   * (equally instant) — and once it has been fetched successfully even
   * once, sw.js's own generic same-origin caching rule keeps it
   * available offline forever after, with no CORS dependency and no
   * per-photo IndexedDB bookkeeping at all. Only if there is no local
   * fixture (or it 404s) does this fall through to the Drive link (with
   * its full retry+IndexedDB chain, unchanged) and finally to
   * onFallback. Driver/Doctor personal photos never pass a localUrl —
   * there are far too many of those for a hand-curated file per photo.
   * An optional final onLoad callback fires every time the image
   * successfully shows something (from any tier) — used by callers
   * that need the resulting img.src for something other than showing
   * the <img> itself (e.g. applying it as a CSS background — see
   * applyMarketCardBackground in drivers.js).
   */
  Utils.wireImageFallback = function (img, originalUrl, onFallback, localUrl, onLoad) {
    const candidates = originalUrl ? Utils.driveImageCandidates(originalUrl) : [];
    const urls = candidates.length ? candidates : (originalUrl ? [originalUrl] : []);
    const laterDelaysMs = [2000, 5000, 10000, 20000, 30000];
    let attempt = 1; // urls[0] is the first one this function itself sets as img.src below
    let servedFromCache = false;
    let servedFromLocalFixture = false;

    img.style.opacity = "0";
    img.style.transition = "opacity 0.25s ease";
    img.onload = function () {
      img.style.opacity = "1";
      // Already-cached bytes, or a same-origin fixture (sw.js's own
      // generic caching already covers that permanently) — nothing to
      // back up into the Drive photo cache.
      if (!servedFromCache && !servedFromLocalFixture) {
        const loadedUrl = img.src;
        if (!Utils.storage.get(CORS_BACKFILL_BLOCKED_KEY, false)) {
          fetch(loadedUrl, { mode: "cors" })
            .then((res) => (res && res.ok ? res.blob() : null))
            .then((blob) => { if (blob) Utils.photoCache.put(originalUrl, blob); })
            .catch(() => { Utils.storage.set(CORS_BACKFILL_BLOCKED_KEY, true); });
        }
      }
      if (onLoad) onLoad();
    };

    function startNetworkRetryChain() {
      if (!urls.length) { onFallback(); return; } // no local fixture AND no Drive link at all
      img.onerror = retry;
      img.src = urls[0];
    }

    function retry() {
      if (!img.isConnected) return; // card no longer on screen — nothing to update, stop here
      const totalAttempts = urls.length + laterDelaysMs.length;
      if (attempt >= totalAttempts) { onFallback(); return; }
      const isFirstRound = attempt < urls.length;
      const url = urls[attempt % urls.length];
      const delay = isFirstRound ? 0 : laterDelaysMs[attempt - urls.length];
      attempt++;
      if (delay === 0) {
        img.src = url;
      } else {
        setTimeout(() => { if (img.isConnected) img.src = url; }, delay);
      }
    }

    function startDriveChain() {
      if (!urls.length) { onFallback(); return; }
      Utils.photoCache.get(originalUrl).then((blob) => {
        if (!img.isConnected) return; // card already gone by the time IndexedDB answered
        if (blob) {
          servedFromCache = true;
          img.onerror = startNetworkRetryChain; // extremely unlikely (corrupted entry) — fall back to the normal network path
          img.src = URL.createObjectURL(blob);
        } else {
          startNetworkRetryChain();
        }
      });
    }

    if (localUrl) {
      img.onerror = () => {
        if (!img.isConnected) return;
        img.onerror = null;
        servedFromLocalFixture = false; // that attempt failed — a later Drive success should still be backed up normally
        startDriveChain();
      };
      img.src = localUrl;
      // Only actually "from the local fixture" once it loads — the
      // onerror handler above resets this back to false if this
      // particular attempt 404s and falls through to the Drive chain.
      servedFromLocalFixture = true;
    } else {
      startDriveChain();
    }
  };

  /**
   * Builds the same-origin local-fixture path for a Market photo,
   * Market background, Vehicle-category photo, or a Driver/Doctor
   * profile photo (kind "profile", keyed by the person's ID) — see
   * Utils.wireImageFallback's own comment above for what this is and
   * why. `slug` is the SAME slug already used in the URL (e.g. the
   * driver-facing link ".../markets/abdur-rab-bazar/easy-bike" uses the
   * exact strings "abdur-rab-bazar" and "easy-bike"), so a filename
   * always matches automatically — no separate naming step. Returns a
   * path whether or not the file actually exists yet; a missing file
   * just 404s and wireImageFallback quietly falls through to the Drive
   * link, exactly as if this had never been called.
   */
  Utils.localFixtureUrl = function (kind, slug) {
    if (!slug) return null;
    if (kind === "market") return "assets/local-photos/markets/" + slug + ".jpg";
    if (kind === "marketBg") return "assets/local-photos/markets/" + slug + "-bg.jpg";
    if (kind === "vehicle") return "assets/local-photos/vehicles/" + slug + ".jpg";
    // Driver / Doctor personal photo: one shared folder, filename = the
    // person's own ID exactly as it appears in the Sheet (e.g. D1111.jpg
    // — case matters, GitHub Pages file names are case-sensitive).
    if (kind === "profile") return "assets/local-photos/profilePhoto/" + encodeURIComponent(String(slug).trim()) + ".jpg";
    return null;
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
