const NEW_BASE = "https://saiful-987-yu.github.io/amader-elaka/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (e) {}
    try { await self.clients.claim(); } catch (e) {}
    try {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      list.forEach((client) => {
        try {
          const u = new URL(client.url);
          client.navigate(NEW_BASE + u.search + u.hash);
        } catch (e) {}
      });
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
  })());
});
