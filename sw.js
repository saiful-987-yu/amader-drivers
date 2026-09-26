/**
 * Amader Driver — Service Worker (DISABLED / self-removing)
 * -----------------------------------------------------------
 * An earlier version of this file made every image request go through
 * this Service Worker's own cache-first logic. In real testing that
 * turned out to break image loading entirely for some
 * browsers/devices — Google's Drive/thumbnail hosts don't always
 * behave the same way when fetched from inside a Service Worker as
 * they do from a plain <img> tag, so requests that would have loaded
 * fine directly were failing here instead.
 *
 * Rather than risk that again, this file now does nothing at all: no
 * fetch handler, no interception, no caching. Every image request
 * goes straight to the network exactly as if this Service Worker
 * didn't exist — the browser's own HTTP cache still speeds up repeat
 * visits on its own, which is what was actually happening before any
 * of this was added.
 *
 * Because a Service Worker that's already installed in someone's
 * browser keeps running until it's replaced, this version actively
 * cleans up after the old one: on activate it deletes every cache
 * this Service Worker ever created, unregisters itself, and reloads
 * any open tab it was controlling — so anyone who already has the old
 * broken version installed gets healed automatically the next time
 * they open the site, with no action needed from them.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        // Only the OLD broken version ever created caches (this version
        // never does), so a non-empty list here means we're cleaning up
        // after it and a one-time reload is worth it to heal the page
        // immediately. On a fresh install (nothing to delete — the
        // common case for every new visitor, and for this same version
        // re-activating) there is nothing to clean up, so we must NOT
        // reload: since index.html unconditionally re-registers this
        // file on every load, an unconditional reload here would just
        // re-trigger install -> activate -> reload forever.
        const hadOldCaches = keys.length > 0;
        return Promise.all(keys.map((key) => caches.delete(key))).then(() => hadOldCaches);
      })
      .then((hadOldCaches) => self.registration.unregister().then(() => hadOldCaches))
      .then((hadOldCaches) => {
        if (!hadOldCaches) return;
        return self.clients.matchAll().then((clientList) => clientList.forEach((client) => client.navigate(client.url)));
      })
      .catch(() => {})
  );
});

// Deliberately no "fetch" event handler — every request (images included)
// is left completely untouched and goes straight to the network/browser.

