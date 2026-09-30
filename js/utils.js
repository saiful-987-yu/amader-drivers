(function (window) {
  "use strict";

  const Utils = {};

  Utils.qs = (sel, root) => (root || document).querySelector(sel);
  Utils.qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

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

  Utils.debounce = function (fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  Utils.normalizePhone = function (raw) {
    if (!raw) return "";
    let value = String(raw).trim().replace(/[^\d+]/g, "");
    if (value.startsWith("+880")) return value;
    if (value.startsWith("880")) return "+" + value;
    if (value.startsWith("0") && value.length === 11) return "+88" + value;
    if (/^\d{10}$/.test(value)) return "+880" + value;
    return value;
  };

  Utils.isValidBdPhone = function (raw) {
    if (!raw) return false;
    const digits = String(raw).replace(/[^\d]/g, "");
    if (/^01[3-9]\d{8}$/.test(digits)) return true;
    if (/^8801[3-9]\d{8}$/.test(digits)) return true;
    return false;
  };

  Utils.resolveImageUrl = function (url) {
    if (!url) return "";
    const trimmed = String(url).trim();
    if (!trimmed) return "";
    const candidates = Utils.driveImageCandidates(trimmed);
    return candidates.length ? candidates[0] : trimmed;
  };

  Utils.driveFileId = function (url) {
    const trimmed = String(url || "").trim();
    if (!trimmed || !/drive\.google\.com|docs\.google\.com/.test(trimmed)) return "";
    const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    return match ? match[1] : "";
  };

  Utils.driveImageCandidates = function (url) {
    const id = Utils.driveFileId(url);
    if (!id) return [];
    return [
      `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
      `https://lh3.googleusercontent.com/d/${id}`,
      `https://drive.google.com/uc?export=view&id=${id}`
    ];
  };

  Utils.photoCache = (function () {
    const DB_NAME = "amader-photo-cache";
    const DB_VERSION = 1;
    const STORE = "photos";
    const MAX_BLOB_BYTES = 8 * 1024 * 1024;
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
          } catch (e) { }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      return dbPromise;
    }

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

  const CORS_BACKFILL_BLOCKED_KEY = "nobi.photoCache.corsBlocked";

  Utils.wireImageFallback = function (img, originalUrl, onFallback, localUrl, onLoad) {
    const candidates = originalUrl ? Utils.driveImageCandidates(originalUrl) : [];
    const urls = candidates.length ? candidates : (originalUrl ? [originalUrl] : []);
    const laterDelaysMs = [2000, 5000, 10000, 20000, 30000];
    let attempt = 1;
    let servedFromCache = false;
    let servedFromLocalFixture = false;

    img.style.opacity = "0";
    img.style.transition = "opacity 0.25s ease";
    img.onload = function () {
      img.style.opacity = "1";
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
      if (!urls.length) { onFallback(); return; }
      img.onerror = retry;
      img.src = urls[0];
    }

    function retry() {
      if (!img.isConnected) return;
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
        if (!img.isConnected) return;
        if (blob) {
          servedFromCache = true;
          img.onerror = startNetworkRetryChain;
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
        servedFromLocalFixture = false;
        startDriveChain();
      };
      img.src = localUrl;
      servedFromLocalFixture = true;
    } else {
      startDriveChain();
    }
  };

  Utils.localFixtureUrl = function (kind, slug) {
    if (!slug) return null;
    if (kind === "market") return "assets/local-photos/markets/" + slug + ".jpg";
    if (kind === "marketBg") return "assets/local-photos/markets/" + slug + "-bg.jpg";
    if (kind === "vehicle") return "assets/local-photos/vehicles/" + slug + ".jpg";
    if (kind === "profile") return "assets/local-photos/profilePhoto/" + encodeURIComponent(String(slug).trim()) + ".jpg";
    return null;
  };

  Utils.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

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
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
      }
    }
  };

  Utils.driverDisplayName = function (driver) {
    if (!driver) return "";
    const isBn = window.Lang && window.Lang.current() === "bn";
    return (isBn && driver.nameBn) ? driver.nameBn : driver.name;
  };

  Utils.clean = function (value) {
    return (value == null ? "" : String(value)).trim().replace(/\s+/g, " ");
  };

  Utils.waLink = function (raw) {
    const normalized = Utils.normalizePhone(raw);
    return "https://wa.me/" + normalized.replace(/^\+/, "");
  };

  Utils.resolveWhatsApp = function (driver) {
    const raw = Utils.clean(driver && driver.whatsapp);
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (upper === "N" || raw === "নাই" || raw === "না") return null;
    if (upper === "F") return driver.phone ? driver.phone : null;
    if (upper === "A") return driver.altPhone ? driver.altPhone : null;
    return raw;
  };

  Utils.starCount = function (raw) {
    const num = parseFloat(raw);
    if (isNaN(num)) return 0;
    return Math.min(5, Math.max(0, Math.round(num)));
  };

  Utils.splitMulti = function (raw) {
    if (!raw) return [];
    return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  };

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

  Utils.buildVideoSection = function (rawUrl, titleText) {
    const embedUrl = Utils.videoEmbedUrl(rawUrl);
    if (!embedUrl) return null;

    const iframe = Utils.el("iframe", {
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

  const SOCIAL_PLATFORMS = [
    { key: "maps", label: "Google Maps", icon: "mapPin", hosts: ["maps.google.com", "maps.app.goo.gl", "g.page", "goo.gl/maps"] },
    { key: "facebook", label: "Facebook", icon: "facebook", hosts: ["facebook.com", "fb.com", "fb.me", "fb.watch"] },
    { key: "youtube", label: "YouTube", icon: "youtube", hosts: ["youtube.com", "youtu.be"] },
    { key: "whatsapp", label: "WhatsApp", icon: "whatsapp", hosts: ["wa.me", "whatsapp.com"] },
    { key: "tiktok", label: "TikTok", icon: "tiktok", hosts: ["tiktok.com"] },
    { key: "linkedin", label: "LinkedIn", icon: "linkedin", hosts: ["linkedin.com", "lnkd.in"] },
    { key: "instagram", label: "Instagram", icon: "instagram", hosts: ["instagram.com", "instagr.am"] },
    { key: "x", label: "X", icon: "xTwitter", hosts: ["twitter.com", "x.com", "t.co"] },
    { key: "telegram", label: "Telegram", icon: "telegram", hosts: ["t.me", "telegram.me", "telegram.org"] },
    { key: "messenger", label: "Messenger", icon: "messenger", hosts: ["m.me", "messenger.com"] },
    { key: "snapchat", label: "Snapchat", icon: "snapchat", hosts: ["snapchat.com"] },
    { key: "pinterest", label: "Pinterest", icon: "pinterest", hosts: ["pinterest.com", "pin.it"] },
    { key: "threads", label: "Threads", icon: "threads", hosts: ["threads.net", "threads.com"] }
  ];

  Utils.parseSocialLinks = function (raw) {
    if (!raw) return [];
    const parts = String(raw).split(/\s*\n\s*|,\s+|,(?=https?:\/\/)/i);
    const out = [];
    parts.forEach((part) => {
      let candidate = part.trim().replace(/^[,\s]+|[,\s]+$/g, "");
      if (!candidate) return;
      if (!/^[a-z][a-z0-9+.\-]*:/i.test(candidate)) {
        if (!/^[\w\-]+(\.[\w\-]+)+(\/|\?|#|$)/.test(candidate)) return;
        candidate = "https://" + candidate;
      }
      let u;
      try { u = new URL(candidate); } catch (e) { return; }
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
      const hostAndPath = host + u.pathname.toLowerCase();
      let platform = null;
      if (host.indexOf("google.") !== -1 && /^\/maps(\/|$)/.test(u.pathname.toLowerCase())) {
        platform = SOCIAL_PLATFORMS[0];
      } else {
        platform = SOCIAL_PLATFORMS.find((p) => p.hosts.some((h) =>
          h.indexOf("/") !== -1 ? hostAndPath.indexOf(h) === 0 : (host === h || host.endsWith("." + h))
        )) || null;
      }
      if (platform) out.push({ url: u.href, key: platform.key, label: platform.label, icon: Icons[platform.icon] });
      else out.push({ url: u.href, key: "website", label: host, icon: Icons.website });
    });
    return out;
  };

  Utils.buildSocialLinksSection = function (rawUrls) {
    const items = Utils.parseSocialLinks(rawUrls);
    if (!items.length) return null;
    return Utils.el("div", { class: "social-links-section" }, items.map((it) =>
      Utils.el("a", {
        href: it.url,
        target: "_blank",
        rel: "noopener noreferrer",
        class: "social-links__btn social-links__btn--" + it.key,
        "aria-label": it.label,
        title: it.label,
        html: it.icon
      })
    ));
  };

  Utils.speak = function (text, lang) {
    const clean = Utils.clean(text);
    if (!clean || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = lang === "bn" ? "bn-BD" : "en-US";
      window.speechSynthesis.speak(utter);
    } catch (err) {
    }
  };

  const SAFE_TAGS = ["p", "br", "hr", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "a", "span", "div", "blockquote"];
  const DROP_TAGS = ["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button", "textarea", "select", "svg", "math", "template", "noscript"];

  Utils.safeHtml = function (rawHtml) {
    const source = rawHtml == null ? "" : String(rawHtml);
    if (!source) return "";
    try {
      const doc = new DOMParser().parseFromString("<body>" + source + "</body>", "text/html");
      const clean = function (parent) {
        Array.from(parent.childNodes).forEach((node) => {
          if (node.nodeType === 3) return;
          if (node.nodeType !== 1) { parent.removeChild(node); return; }
          const tag = node.tagName.toLowerCase();
          if (DROP_TAGS.indexOf(tag) !== -1) { parent.removeChild(node); return; }
          clean(node);
          if (SAFE_TAGS.indexOf(tag) === -1) {
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
            return;
          }
          const href = tag === "a" ? node.getAttribute("href") : null;
          Array.from(node.attributes).forEach((a) => node.removeAttribute(a.name));
          if (tag === "a" && href && /^(https?:|mailto:|tel:)/i.test(href.trim())) {
            node.setAttribute("href", href.trim());
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
          }
        });
      };
      clean(doc.body);
      return doc.body.innerHTML;
    } catch (err) {
      return "";
    }
  };

  window.Utils = Utils;
})(window);
