const CACHE_PREFIX = "fitloop-shell-";
const CACHE_NAME = "fitloop-shell-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/fitloop.svg"];

// Pre-cache only the small public app shell. Authenticated data is deliberately fetched at runtime.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Remove older FitLoop shell versions after a new worker takes over, but leave unrelated origin caches alone.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Use network-first navigation so users see current app code when online and a cached shell when offline.
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache authenticated API traffic, non-GET requests or cross-origin data.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigations prefer the server response; the cached root is the fallback when the network is unavailable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response.ok) return response;

          // Wait for the refreshed app shell to be written before ending the fetch event.
          return caches.open(CACHE_NAME)
            .then(cache => cache.put("/", response.clone()))
            .then(() => response);
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")))
    );
    return;
  }

  // Static assets use cache-first behaviour because their URLs are versioned by the build and safe to reuse.
  event.respondWith(
    caches.match(request).then(cached => {
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response.ok || response.type !== "basic") return response;

        // Keep the response alive until its cache write finishes; a terminated
        // service worker must not silently lose the newly downloaded asset.
        return caches.open(CACHE_NAME)
          .then(cache => cache.put(request, response.clone()))
          .then(() => response);
      });
    })
  );
});
