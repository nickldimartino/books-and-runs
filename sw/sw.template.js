// Books & Runs service worker — TEMPLATE. app/sw.js/route.ts reads this file
// at build time, stamps __BUILD_ID__ with the deploy's identifier, and emits
// the result as /sw.js. (It used to be a static public/sw.js; a static file
// could never change between deploys, which meant three things were broken:
// the browser had no reason to install a "new" worker, so the update banner
// never fired for ordinary deploys; the un-hashed files it cached — /init.js,
// icons — were cache-first and could never be refreshed; and nothing ever
// pruned the cache.) Because the stamped file now differs on every deploy,
// the browser installs it, `activate` drops every superseded cache, and
// ServiceWorkerRegistrar's controllerchange listener raises the banner.
//
// Two independent jobs:
//   1. Offline shell caching — same-origin GETs only (Supabase reads/writes
//      are cross-origin and must always hit the network), three strategies:
//        - /_next/static/*   content-hashed => immutable => cache-first, in a
//                            cache that survives deploys (a chunk whose URL
//                            didn't change is still valid), entry-capped.
//        - page navigations  network-first with a short timeout race (lie-fi
//                            must not hang the page), falling back to the last
//                            copy of that *path* (query strings ignored — the
//                            HTML is identical for /multiplayer/play?id=a and
//                            ?id=b) and finally /offline.html. RSC ".txt"
//                            payloads (client-side route changes) likewise.
//        - other same-origin static files (init.js, icons, manifest…)
//                            un-hashed => stale-while-revalidate, so they
//                            can't be stuck forever, in the per-deploy cache.
//   2. Web Push — notification display + tap routing (see the `mp` Edge
//      Function's sendPushForEvent).
//
// The pure decision helpers are exported for vitest via the guarded
// module.exports at the bottom (see app/sw.test.tsx).

const BUILD_ID = "__BUILD_ID__";
/** Per-deploy cache: page HTML, RSC payloads, un-hashed static files. Named
 * after the build so `activate` can drop every earlier one wholesale. */
const SHELL_CACHE = "br-shell-" + BUILD_ID;
/** Content-hashed /_next/static files: valid across deploys, only trimmed. */
const STATIC_CACHE = "br-static-v2";
const CACHE_PREFIX = "br-";
const OFFLINE_URL = "/offline.html";
const MAX_SHELL_ENTRIES = 80;
const MAX_STATIC_ENTRIES = 160;
/** Skip caching any single response larger than this (bytes, per Content-Length). */
const MAX_ENTRY_BYTES = 1500000;
const NAV_TIMEOUT_MS = 4000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

// ── pure helpers ───────────────────────────────────────────────────────────

/** Which strategy a request gets. */
function classifyRequest(method, mode, destination, urlString, origin) {
  if (method !== "GET") return "skip";
  let url;
  try {
    url = new URL(urlString);
  } catch (e) {
    return "skip";
  }
  if (url.origin !== origin) return "skip";
  const path = url.pathname;
  if (path === "/sw.js") return "skip"; // never cache the worker itself
  if (path.indexOf("/_next/static/") === 0) return "immutable";
  if (mode === "navigate") return "navigate";
  if (/\.txt$/.test(path) || url.searchParams.has("_rsc")) return "rsc";
  if (
    destination === "script" ||
    destination === "style" ||
    destination === "image" ||
    destination === "font" ||
    /\.(js|css|png|jpe?g|svg|webp|gif|ico|woff2?|webmanifest)$/.test(path)
  ) {
    return "swr";
  }
  return "skip";
}

/** The cache key for a page: origin + path, no query string/hash, no
 * trailing slash (except root). */
function navigationKey(urlString) {
  const url = new URL(urlString);
  let path = url.pathname;
  if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
  return url.origin + path;
}

/** Cache names to delete on activate: every "br-" cache that isn't one of
 * the two current ones. Foreign caches (someone else's, same origin) are
 * left alone. */
function cachesToDelete(names, shellName, staticName) {
  return names.filter(function (n) {
    return n.indexOf(CACHE_PREFIX) === 0 && n !== shellName && n !== staticName;
  });
}

/** Given cache keys oldest-first, which to evict to stay within `max`.
 * `protectedUrls` (the offline page) are never evicted. */
function keysToEvict(keyUrls, max, protectedUrls) {
  const excess = keyUrls.length - max;
  if (excess <= 0) return [];
  const out = [];
  for (let i = 0; i < keyUrls.length && out.length < excess; i++) {
    if (protectedUrls && protectedUrls.indexOf(keyUrls[i]) !== -1) continue;
    out.push(keyUrls[i]);
  }
  return out;
}

/** Whether a fetched response is worth keeping. */
function isCacheable(status, type, contentLength) {
  if (status !== 200 || type !== "basic") return false;
  if (contentLength && Number(contentLength) > MAX_ENTRY_BYTES) return false;
  return true;
}

// ── cache plumbing ─────────────────────────────────────────────────────────

async function trimCache(cache, max) {
  const keys = await cache.keys(); // insertion order == oldest first
  const evict = keysToEvict(
    keys.map(function (r) {
      return r.url;
    }),
    max,
    [self.location.origin + OFFLINE_URL]
  );
  await Promise.all(
    evict.map(function (u) {
      return cache.delete(u);
    })
  );
}

/** A response that followed a redirect (a host that 301s /x.html -> /x, a
 * trailing-slash redirect…) can't be *served* to a navigation — Chrome
 * fails the load with ERR_FAILED — so store a clean copy instead. */
function unredirect(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function putBounded(cache, key, response, max) {
  if (!isCacheable(response.status, response.type, response.headers.get("content-length"))) return;
  try {
    await cache.put(key, unredirect(response));
    await trimCache(cache, max);
  } catch (e) {
    // Quota exceeded or an opaque failure — caching is best-effort.
  }
}

// In-memory only (resets when the worker idles): throttles LRU "touches" so a
// page load's ~15 chunk hits don't each rewrite their cache entry.
const lastTouched = new Map();
function touch(cache, request, response) {
  const now = Date.now();
  const last = lastTouched.get(request.url) || 0;
  if (now - last < TOUCH_INTERVAL_MS) return Promise.resolve();
  lastTouched.set(request.url, now);
  // delete + put moves the entry to the newest end of keys().
  return cache.delete(request).then(function () {
    return cache.put(request, response);
  });
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    const t = setTimeout(function () {
      reject(new Error("timeout"));
    }, ms);
    promise.then(
      function (v) {
        clearTimeout(t);
        resolve(v);
      },
      function (e) {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function cacheFirstImmutable(event) {
  const req = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) {
    event.waitUntil(touch(cache, req, cached.clone()).catch(function () {}));
    return cached;
  }
  const res = await fetch(req);
  event.waitUntil(putBounded(cache, req, res.clone(), MAX_STATIC_ENTRIES));
  return res;
}

async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const refresh = fetch(req).then(function (res) {
    event.waitUntil(putBounded(cache, req, res.clone(), MAX_SHELL_ENTRIES));
    return res;
  });
  if (cached) {
    event.waitUntil(refresh.catch(function () {}));
    return cached;
  }
  return refresh;
}

/** Network-first with a timeout race. `keyFor` maps the request to its cache
 * key; `fallbackToOffline` adds /offline.html as the last resort (pages only). */
async function networkFirst(event, keyFor, fallbackToOffline) {
  const req = event.request;
  const cache = await caches.open(SHELL_CACHE);
  const key = keyFor(req.url);
  const network = fetch(req).then(function (res) {
    event.waitUntil(putBounded(cache, key, res.clone(), MAX_SHELL_ENTRIES));
    return res;
  });
  try {
    return await withTimeout(network, NAV_TIMEOUT_MS);
  } catch (e) {
    const cached = await cache.match(key);
    if (cached) {
      // Keep the worker alive so a slow network still refreshes the copy.
      event.waitUntil(network.catch(function () {}));
      return cached;
    }
    if (e && e.message === "timeout") return network; // nothing cached — keep waiting
    if (fallbackToOffline) {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw e;
  }
}

// ── lifecycle ──────────────────────────────────────────────────────────────

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        return fetch(OFFLINE_URL).then(function (res) {
          if (!res.ok) throw new Error("offline page unavailable");
          return cache.put(OFFLINE_URL, unredirect(res));
        });
      })
      .catch(function () {
        // Offline page not reachable at install time — a real offline visit
        // just won't have a fallback until a later successful install.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          cachesToDelete(names, SHELL_CACHE, STATIC_CACHE).map(function (n) {
            return caches.delete(n);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  const strategy = classifyRequest(req.method, req.mode, req.destination, req.url, self.location.origin);
  if (strategy === "skip") return;
  if (strategy === "immutable") {
    event.respondWith(cacheFirstImmutable(event));
  } else if (strategy === "navigate") {
    event.respondWith(networkFirst(event, navigationKey, true));
  } else if (strategy === "rsc") {
    event.respondWith(networkFirst(event, function (u) { return u; }, false));
  } else {
    event.respondWith(staleWhileRevalidate(event));
  }
});

// ── web push ───────────────────────────────────────────────────────────────

self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Books & Runs";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.tag,
        data: { url: data.url || "/" },
      }),
      // A bare dot on the app icon until the app opens and sets the exact
      // pending-turn count (AppBadgeSync.tsx). Best-effort: not every
      // platform exposes the Badging API to workers.
      self.navigator && self.navigator.setAppBadge
        ? self.navigator.setAppBadge().catch(function () {})
        : Promise.resolve(),
    ])
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.endsWith(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { classifyRequest, navigationKey, cachesToDelete, keysToEvict, isCacheable };
}
