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
  API_BASE_URL: "https://script.google.com/macros/s/AKfycbxMqG4U_jfIA_vuDF9eSyWljVx0y0EkQ1VC1yF8FCm7MkyzYUYNbEXdyc4oszig0XMSVg/exec",

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

  // Driver/Doctor availability changes at any time, so it refreshes
  // more often than static data (Markets/Vehicle Categories).
  STATUS_CACHE_TTL_MS: 60 * 1000,

  // How long (ms) to wait for the API before showing a
  // network-error state with a Retry button.
  REQUEST_TIMEOUT_MS: 12000,

  // Homepage banner — Slide 1 is generated from site text; Slides 2/3
  // use these image files. Drop images into /assets/home-banners/ with
  // these exact filenames to replace the placeholder (see that folder's
  // own README).
  BANNER_IMAGES: {
    slide2: "assets/home-banners/home-banner-02.jpg",
    slide3: "assets/home-banners/home-banner-03.jpg"
  },

  // Background photo for the Registration and Doctor homepage sections.
  // Falls back to the existing solid color automatically if the file
  // isn't there yet — nothing to configure beyond the filenames.
  SECTION_BACKGROUNDS: {
    registration: "assets/home-banners/home-registration-banner.jpg",
    doctor: "assets/home-banners/home-doctor-banner.jpg"
  },

  // Footer social links — leave as "#" until a real URL is available.
  SOCIAL_LINKS: {
    facebook: "#",
    whatsapp: "#",
    tiktok: "#",
    linkedin: "#"
  }
};
