// Minimal offline support for the static-export website (not used inside the
// Capacitor iOS app, which already bundles everything locally — see
// ServiceWorkerRegister.tsx). Network-first, falling back to whatever was
// last cached, so a visitor who's loaded the app before can keep playing
// with no connection. Bump CACHE_NAME to force clients to drop everything
// cached under an old version.
const CACHE_NAME = "books-and-runs-v1";

// The core pass-and-play loop, cached up front so a fresh install works
// offline even before the visitor has clicked into every page themselves.
const CORE_ASSETS = ["/", "/new-game", "/game"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
