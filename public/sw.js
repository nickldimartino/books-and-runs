// Books & Runs service worker.
//
// Two independent jobs:
//   1. Offline shell caching — same-origin GET requests get cached as
//      they're fetched, so a page you've already visited (and its JS/CSS)
//      still loads with no connection. Deliberately simple runtime caching,
//      not a build-time precache manifest (Workbox etc.): Next's static
//      export content-hashes every JS/CSS filename, so caching whatever a
//      real visit actually requested is safe — a cached URL can never go
//      stale, there's nothing to invalidate. Never touches cross-origin
//      requests (Supabase reads/writes must always hit the network) or
//      anything but GET.
//   2. Web Push — shows a notification for "your turn" etc. (see the `mp`
//      Edge Function's addEvent(), which sends the actual push) and routes
//      a tap on it to the right game.
//
// Registered from app/lib/pushSubscriptions.ts's registerServiceWorker().

const CACHE_NAME = "br-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {
        // Offline page not reachable at install time — a real offline visit
        // just won't have a fallback until a later successful install.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !isSameOrigin(req.url)) return;

  // A full page load: network first (always prefer the live version when
  // there's a connection), falling back to whatever was last cached for
  // this exact URL, and finally the generic offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Static assets: cache first (instant, and correct — see the file's own
  // doc on why a cached URL never goes stale), network as the fallback for
  // anything not seen yet, caching it for next time.
  if (["script", "style", "image", "font"].includes(req.destination)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Books & Runs";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.endsWith(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
