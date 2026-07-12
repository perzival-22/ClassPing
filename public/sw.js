/* ClassPing service worker.
 *
 * Two jobs:
 *   1. Deliver reminder notifications and focus the app when one is tapped.
 *   2. Cache the app shell so a cold start with no network still opens.
 *
 * The user's data already survives offline in localStorage — this is what makes
 * the *page itself* load offline, which is what "installable PWA" actually
 * promises and what this file previously didn't do.
 *
 * Bump CACHE_VERSION whenever the rules below change: the activate handler
 * deletes every cache that doesn't match, so stale entries can't linger.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `classping-static-${CACHE_VERSION}`;
const PAGES_CACHE = `classping-pages-${CACHE_VERSION}`;

/** Cap the page cache so a long semester of browsing can't grow it unbounded. */
const MAX_PAGES = 30;

/** Available offline even on the very first launch. */
const PRECACHE = ["/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {
        /* precache is best-effort — never block activation on it */
      })
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
            .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Trim a cache to its newest `max` entries (keys come back insertion-ordered). */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) {
    await cache.delete(key);
  }
}

/**
 * Only a response we can safely replay to this same user belongs in the cache.
 *
 * `res.redirected` is the load-bearing check: a signed-out request for /home is
 * 302'd by the middleware to the sign-in screen. Caching *that* under the /home
 * key would pin the sign-in page onto /home for everyone afterwards.
 */
function isCacheable(res) {
  return res && res.ok && res.type === "basic" && !res.redirected;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch: non-GET, cross-origin (Clerk, Google Fonts), or our own API.
  // The API is per-user and auth-gated — a cached /api/sync response would be
  // both stale and a cross-account leak on a shared device.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Hashed build output and icons are immutable, so cache-first is safe.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (isCacheable(res)) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network-first, so a signed-in user always gets fresh HTML and the
  // middleware's auth redirect is always honored. Cache is the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(PAGES_CACHE).then(async (c) => {
              await c.put(request, copy);
              await trim(PAGES_CACHE, MAX_PAGES);
            });
          }
          return res;
        })
        .catch(async () => {
          // Offline: this exact page if we've seen it, otherwise any shell we
          // have, so the app opens rather than showing the browser's error page.
          return (
            (await caches.match(request)) ||
            (await caches.match("/home")) ||
            (await caches.match("/")) ||
            Response.error()
          );
        }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow("/home");
      }),
  );
});
