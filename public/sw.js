// Minimal offline support for the static-export website (not used inside the
// Capacitor iOS app, which already bundles everything locally — see
// ServiceWorkerRegister.tsx). Network-first, falling back to whatever was
// last cached, so a visitor who's loaded the app before can keep playing
// with no connection. Bump CACHE_NAME to force clients to drop everything
// cached under an old version.
const CACHE_NAME = "books-and-runs-v3";

// The core pass-and-play loop, precached so a fresh install works offline
// even before the visitor has clicked into every page themselves.
const CORE_ROUTES = ["/", "/new-game", "/game"];

// A cached route's HTML is useless offline without the JS it hydrates
// with — Next's static export gives every chunk a content hash that
// changes on every build, so rather than guess filenames by hand, this
// reads a route's *actual* served HTML and caches whatever /_next/ assets
// it references (v1 of this file only cached the bare HTML, which loaded
// but left every button dead with no JS behind it).
async function precacheRoute(cache, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const html = await res.clone().text();
    await cache.put(url, res);

    const assetUrls = new Set();
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)) {
      assetUrls.add(match[1]);
    }
    await Promise.all(
      [...assetUrls].map(async (assetUrl) => {
        try {
          const assetRes = await fetch(assetUrl);
          if (assetRes.ok) await cache.put(assetUrl, assetRes);
        } catch {
          // one missing asset shouldn't block caching the rest
        }
      })
    );
  } catch {
    // offline (or a real error) during install — the fetch handler below
    // still opportunistically caches routes as they're visited later
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(CORE_ROUTES.map((url) => precacheRoute(cache, url))))
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

  // Cache-first, refreshing in the background — deliberately NOT network-
  // first. iOS Safari's fetch() is documented to hang instead of rejecting
  // when the device is genuinely offline (airplane mode, no signal), rather
  // than failing fast like it does on desktop browsers. A network-first
  // strategy waits on that hung fetch before ever trying the cache, which
  // in practice means "the whole navigation just never finishes" — matching
  // exactly what was reported (every page but Home stalling offline; Home
  // likely wasn't a real test of this code path at all, since Safari can
  // show a restored tab's last render without any new network activity).
  // Returning a cache hit immediately sidesteps waiting on that fetch at
  // all, while still updating the cache for next time whenever the network
  // call does resolve.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkUpdate = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => null);

      if (cached) return cached;
      return networkUpdate.then((response) => response || caches.match("/"));
    })
  );
});
