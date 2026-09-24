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
  API_BASE_URL: "https://script.google.com/macros/s/AKfycby93KRpwGKmhugI8ZbCRgBPEKC3Bb9Aw76N5mAzvJWAgCPGhX1dawQ1Dfzpl0S4NOs-/exec",

  // --------------------------------------------------------
  // PROFILE PHOTO — GOOGLE FORM (Registration Step 3, "Photo Upload")
  // --------------------------------------------------------
  // URL is the existing Google Form used for the direct photo-upload
  // option. Google Forms' "file upload" question type always requires
  // the respondent to sign in with a Google account and can never be
  // embedded in an iframe or auto-submitted from JavaScript (this is a
  // hard restriction on Google's side, not something this site can
  // work around) — so the form itself has to open in its own browser
  // tab for the actual upload step. To at least skip re-typing the
  // Mobile Number there, set MOBILE_ENTRY_ID to that field's prefill
  // entry ID and the number the driver already typed in Step 1 will be
  // filled in automatically.
  //
  // HOW TO FIND MOBILE_ENTRY_ID:
  //   1. Open the form's edit link in Google Forms (not the public
  //      viewform link) and open the Mobile Number question.
  //   2. Click the ⋮ (More) menu on that question → "Get pre-filled
  //      link".
  //   3. Fill in any sample value and click "Get link", then "Copy
  //      link". The copied URL contains "...&entry.123456789=...";
  //      the "entry.123456789" part (with your own numbers) is the
  //      value to paste below, as a quoted string.
  //   Leave as null to open the form without pre-filling the number —
  //   everything else keeps working, the driver just has to type their
  //   number again inside the Google Form itself.
  GOOGLE_FORM: {
    URL: "https://docs.google.com/forms/d/e/1FAIpQLSfWSXqhzab6o0Yh6lFrRzXz_F-jxgnvvzoB29mvBg5yDiRnIA/viewform",
    MOBILE_ENTRY_ID: 2002266671
  },

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

  // Homepage banner — Slide 1 always shows the automatic site
  // headline/text (translated live) on the same solid background as
  // the Doctor/Registration sections; if home-banner-01.jpg is present
  // it's used as that slide's background image instead. Slides 2/3 are
  // plain images, falling back to a clean placeholder if their file is
  // missing — never a broken image. Drop images into
  // /assets/home-banners/ with these exact filenames (see that
  // folder's own README).
  BANNER_IMAGES: {
    slide1: "assets/home-banners/home-banner-01.jpg",
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
  // whatsapp is the only exception: give it a plain phone number (any
  // format), not a URL — the footer builds the wa.me link from it.
  SOCIAL_LINKS: {
    facebook: "https://fb.com/Saiful.Islam.Personal",
    whatsapp: "01610-253221",
    tiktok: "https://tiktok.com/@saiful.islam.personal",
    linkedin: "#"
  }
};
