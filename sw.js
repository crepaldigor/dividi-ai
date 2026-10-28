const CACHE = "dividi-ai-static-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/redesign.css",
  "./js/app.js",
  "./js/engine.js",
  "./js/storage.js",
  "./js/personal.js",
  "./js/group-finance.js",
  "./js/group-finance-view.js",
  "./js/analysis-view.js",
  "./assets/favicon.svg",
  "./manifest.webmanifest",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("dividi-ai-static-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      // Prefer the saved source while online; retain cached files for offline use.
      // Revalidate the HTTP cache as well, so a refresh picks up local edits.
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (response.ok) {
          const url = new URL(event.request.url);
          const isAppAsset = ASSETS.some(
            (asset) => new URL(asset, self.registration.scope).href === url.href,
          );
          if (isAppAsset) {
            try { await cache.put(event.request, response.clone()); }
            catch { /* A full cache must not prevent displaying the new file. */ }
          }
        }
        return response;
      } catch (error) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
