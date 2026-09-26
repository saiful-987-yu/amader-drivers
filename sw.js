/**
 * Amader Driver — Service Worker (real, PWA app-shell caching)
 * ---------------------------------------------------------------
 * HISTORY: an earlier version of this file cached EVERY image request
 * (including Google Drive driver/vehicle/doctor photos) through this
 * worker. That broke image loading for some browsers/devices — Google's
 * Drive/thumbnail hosts don't always behave the same fetched from inside
 * a Service Worker as from a plain <img> tag. That version was replaced
 * with a self-disabling no-op file to heal anyone who already had it
 * installed. This version restores real offline caching, but ONLY for
 * this site's own static "app shell" (HTML/CSS/JS/icons/fonts) — Drive
 * photos and every Apps Script (backend) call are still deliberately
 * left completely untouched, exactly like the no-op version left them,
 * so that old bug can never come back.
 *
 * WHAT THIS GIVES THE APP OFFLINE:
 *   - The page itself, all CSS/JS, and the site's own icons/logo load
 *     instantly from cache and work with no internet at all.
 *   - Because this is a single-page app (every route is a "#/..." hash
 *     on the same index.html), caching index.html once means every
 *     route — Home, Drivers, Registration, Profile, etc. — works offline.
 *   - Driver/market/vehicle DATA is NOT cached here — js/api.js already
 *     keeps its own copy in localStorage and serves that instantly
 *     offline, then quietly refreshes it once the network is back. That
 *     existing system is untouched by this file.
 *   - Driver/vehicle/doctor PHOTOS are NOT cached here either (see
 *     HISTORY above) — the browser's own ordinary HTTP cache handles
 *     repeat views of a photo on its own, which is what already works.
 *
 * IMPORTANT FOR WHOEVER MAINTAINS THIS SITE:
 *   Bump CACHE_VERSION below every time ANY file in APP_SHELL changes
 *   (a CSS tweak, a JS fix, a new icon). Browsers only re-check a
 *   Service Worker file for byte-for-byte changes, and this cache is
 *   otherwise served instead of the network, so an unbumped version
 *   means visitors keep seeing the OLD files after an update until this
 *   number changes. A plain "v3" -> "v4" bump is all that's needed.
 */
const CACHE_VERSION = "v3";
const SHELL_CACHE = `amader-shell-${CACHE_VERSION}`;

// Every file needed to run the app with zero network access. Keep this
// in sync with index.html's own <script>/<link> tags and the images it
// references directly (logo, icons) — anything NOT listed here simply
// won't be available the first time a visitor is offline.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/themes.css",
  "./css/style.css",
  "./css/responsive.css",
  "./config/config.js",
  "./js/utils.js",
  "./js/icons.js",
  "./js/language.js",
  "./js/theme.js",
  "./js/api.js",
  "./js/auth.js",
  "./js/search.js",
  "./js/app.js",
  "./js/drivers.js",
  "./js/doctors.js",
  "./js/registration.js",
  "./js/profile.js",
  "./assets/brand/logo-low.png",
  "./assets/brand/favicon-32.png",
  "./assets/brand/favicon-16.png",
  "./assets/brand/apple-touch-icon.png",
  "./assets/brand/pwa-icon-192.png",
  "./assets/brand/pwa-icon-512.png",
  "./assets/icons/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      // Never let ONE missing/renamed file block install entirely —
      // whatever did cache still helps; nothing offline is worse than
      // partial-offline.
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/** Apps Script backend (driver/market/vehicle data, login, registration) — always live, never cached. */
function isBackendRequest(url) {
  return url.hostname.includes("script.google.com") || url.hostname.includes("script.googleusercontent.com");
}

/** Google Drive / thumbnail hosts serving driver, vehicle and doctor photos — deliberately left untouched (see HISTORY above). */
function isDrivePhotoRequest(url) {
  return url.hostname.includes("drive.google.com") || url.hostname.includes("lh3.googleusercontent.com");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept POST (order/login/registration/etc.)

  const url = new URL(req.url);
  if (isBackendRequest(url) || isDrivePhotoRequest(url)) return; // let these go straight to the network, untouched

  // Navigations (opening/refreshing the app, including deep links like
  // "#/markets"): try the network first so anyone online always gets the
  // latest shell, but fall back to the cached index.html the instant
  // there's no connection — this is what makes the whole single-page
  // app work offline on any route.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Same-origin app-shell files (CSS/JS/icons): stale-while-revalidate —
  // instant response from cache, silently refreshed in the background so
  // the NEXT load already has anything that changed (this load still
  // shows the old cached version — that's why CACHE_VERSION must be
  // bumped on real updates, see the note above).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req).then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Everything else cross-origin (Google Fonts CSS/font files): cache-
  // first, so the app's fonts still render offline after the first visit.
  event.respondWith(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
      })
    )
  );
});
