// Minimal offline support for the static-export website (not used inside the
// Capacitor iOS app, which already bundles everything locally — see
// ServiceWorkerRegister.tsx). Cache-first with a background refresh, so a
// visitor who's loaded the app before can keep playing with no connection.
// Bump CACHE_NAME to force clients to drop everything cached under an old
// version.
const CACHE_NAME = "books-and-runs-v5";

// The core pass-and-play loop, precached so a fresh install works offline
// even before the visitor has clicked into every page themselves.
const CORE_ROUTES = ["/", "/new-game", "/game"];

// Where the last precache attempt's outcome gets stashed (as a real cached
// Response, so it survives reloads with no separate storage) — Settings'
// offline panel reads this to show what actually got cached and why,
// instead of a black box you can only guess about from a phone.
const STATUS_URL = "/__sw-status__";

// A cached route's HTML is useless offline without the JS it hydrates
// with — Next's static export gives every chunk a content hash that
// changes on every build, so rather than guess filenames by hand, this
// reads a route's *actual* served HTML and caches whatever /_next/ assets
// it references (v1 of this file only cached the bare HTML, which loaded
// but left every button dead with no JS behind it).
async function precacheRoute(cache, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}` };
    const html = await res.clone().text();
    await cache.put(url, res);

    const assetUrls = new Set();
    for (const match of html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)) {
      assetUrls.add(match[1]);
    }
    let assetFailures = 0;
    for (const assetUrl of assetUrls) {
      try {
        const assetRes = await fetch(assetUrl);
        if (assetRes.ok) {
          await cache.put(assetUrl, assetRes);
        } else {
          assetFailures++;
        }
      } catch {
        assetFailures++;
      }
    }
    return { url, ok: true, assetCount: assetUrls.size, assetFailures };
  } catch (err) {
    return { url, ok: false, error: String(err) };
  }
}

// Sequential, not parallel — gentler on a mobile connection, and means one
// slow/heavy route (the game screen's JS is a lot bigger than a static
// info page) can't starve the others of their share of a timeout.
async function precacheCoreRoutes(cache) {
  const results = [];
  for (const url of CORE_ROUTES) {
    results.push(await precacheRoute(cache, url));
  }
  await cache.put(
    STATUS_URL,
    new Response(JSON.stringify({ at: Date.now(), results }), {
      headers: { "Content-Type": "application/json" },
    })
  );
}

// Tagged so it's easy to filter for in Safari's Web Inspector console —
// connect an iPhone to a Mac over USB (Settings > Safari > Advanced > Web
// Inspector on the phone; Safari > Settings > Advanced > Show features for
// web developers on the Mac, then Develop menu > the phone > the tab).
// Airplane Mode only disables wireless radios, not the USB link, so this
// keeps working even while genuinely offline — the only way left to see
// what's actually happening instead of inferring it from symptoms.
const LOG = (...args) => console.log("[SW]", ...args);

self.addEventListener("install", (event) => {
  LOG("install");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  LOG("activate: start");
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => Promise.all([self.clients.claim(), precacheCoreRoutes(cache)]))
      .then(() => LOG("activate: done, precache complete"))
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === STATUS_URL) return;

  // Cache-first, refreshing in the background — deliberately NOT network-
  // first. iOS Safari's fetch() is documented to hang instead of rejecting
  // when the device is genuinely offline, rather than failing fast like it
  // does on desktop browsers, so waiting on the network before ever trying
  // the cache can mean the whole navigation just never finishes.
  //
  // Matching is done by plain URL string, not the Request object itself.
  // A real navigation's Request has `mode: "navigate"` — a property script
  // can never set, so every precached entry (fetched from inside this file)
  // is necessarily keyed with the default `mode: "cors"` instead. Per spec,
  // Cache matching should only care about the URL (plus Vary-listed headers
  // on the response), but Safari has a documented history of being
  // stricter than that about Request properties that shouldn't matter.
  // Normalizing both the write side and the read side to `request.url`
  // sidesteps that entirely by never comparing Request objects at all.
  const cacheKey = request.url;
  LOG("fetch:", request.mode, cacheKey);

  event.respondWith(
    caches.match(cacheKey).then((cached) => {
      LOG("cache", cached ? "HIT" : "MISS", "for", cacheKey);
      const networkUpdate = fetch(request)
        .then((response) => {
          LOG("network resolved", response.status, "for", cacheKey);
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          }
          return response;
        })
        .catch((err) => {
          LOG("network failed for", cacheKey, String(err));
          return null;
        });

      if (cached) {
        LOG("responding from cache:", cacheKey);
        return cached;
      }
      LOG("no cache hit, waiting on network for", cacheKey);
      return networkUpdate.then((response) => {
        if (response) return response;
        LOG("network+cache both failed, falling back to / for", cacheKey);
        return caches.match("/");
      });
    })
  );
});
