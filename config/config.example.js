/**
 * ============================================================
 * AMADER DRIVERS — PUBLIC CONFIGURATION
 * ============================================================
 *
 * HOW TO USE:
 *   1. Copy this file and rename the copy to "config.js"
 *      (keep it in this same /config folder).
 *   2. Fill in the values below.
 *   3. index.html already loads /config/config.js — do not
 *      rename the file to anything else, and do not delete
 *      this example file (it is documentation).
 *
 * IMPORTANT — WHAT NEVER GOES IN THIS FILE:
 *   - Google service-account private keys
 *   - Google API secrets
 *   - Any password or credential
 *   This file is served to every visitor's browser, so only
 *   PUBLIC information belongs here. The Google Apps Script
 *   Web App URL below is safe to publish: it is a public
 *   endpoint by design, the same way a normal API endpoint
 *   URL is public. The actual spreadsheet access happens
 *   inside your Google Apps Script project, under your
 *   Google account, not in this file.
 * ============================================================
 */

window.NOBI_CONFIG = {

  // --------------------------------------------------------
  // GOOGLE APPS SCRIPT WEB APP URL  ◄── CHANGE THIS VALUE
  // --------------------------------------------------------
  // Deploy the script in /google-apps-script/Code.gs as a
  // Web App (Deploy → New deployment → Web app → Execute as:
  // Me → Who has access: Anyone), then paste the resulting
  // URL here. It looks like:
  // "https://script.google.com/macros/s/XXXXXXXXXXXX/exec"
  //
  // Leave this as null to run the site in DEMO MODE with
  // built-in sample data (no Google Sheet required). This is
  // useful for local testing before you connect a real sheet.
  API_BASE_URL: null,

  // --------------------------------------------------------
  // WEBSITE IDENTITY
  // --------------------------------------------------------
  SITE_NAME_EN: "Amader Drivers",
  SITE_NAME_BN: "আমাদের ড্রাইভার",
  DEFAULT_MARKET_SLUG: "nobi-bazar",

  // --------------------------------------------------------
  // DEFAULT LANGUAGE — "en" or "bn"
  // --------------------------------------------------------
  DEFAULT_LANGUAGE: "en",

  // --------------------------------------------------------
  // DEFAULT THEME — "light" or "dark"
  // --------------------------------------------------------
  DEFAULT_THEME: "light",

  // --------------------------------------------------------
  // REQUEST BEHAVIOUR
  // --------------------------------------------------------
  // How long (ms) to cache public directory data in the
  // visitor's browser before quietly refreshing it again.
  CACHE_TTL_MS: 5 * 60 * 1000,

  // Driver/Doctor availability can change at any time, so their
  // directory data is refreshed more often than static data like
  // Markets/Vehicle Categories (which barely ever change).
  STATUS_CACHE_TTL_MS: 60 * 1000,

  // How long (ms) to wait for the API before showing a
  // network-error state with a Retry button.
  REQUEST_TIMEOUT_MS: 12000,

  // --------------------------------------------------------
  // HOMEPAGE BANNER — Slide 1 is generated automatically from
  // site text; Slides 2 and 3 use these image files. Drop your
  // own images into /assets/banner/ using these exact filenames
  // and they'll appear automatically — no other change needed.
  // Until then, a placeholder is shown so nothing looks broken.
  // --------------------------------------------------------
  BANNER_IMAGES: {
    slide2: "assets/banner/slide-2.jpg",
    slide3: "assets/banner/slide-3.jpg"
  },

  // --------------------------------------------------------
  // FOOTER SOCIAL LINKS  ◄── CHANGE THESE VALUES
  // --------------------------------------------------------
  // Leave any entry as "#" until you have a real link — the
  // icon still shows, it just doesn't go anywhere yet.
  SOCIAL_LINKS: {
    facebook: "#",
    whatsapp: "#",
    tiktok: "#",
    linkedin: "#"
  }
};
