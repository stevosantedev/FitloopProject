const CACHE_PREFIX = "fitloop-shell-";
const CACHE_NAME = "fitloop-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/fitloop.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache authenticated API traffic, non-GET requests or cross-origin data.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

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
