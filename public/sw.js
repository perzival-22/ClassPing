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

/* ── Web Push ──────────────────────────────────────────────────────────────
 *
 * Server-sent notifications (VAPID). Today there's one kind: the post-class
 * nudge, fired by /api/cron/post-class once a class has finished, asking
 * whether it came with an assignment.
 *
 * This is the half the in-app reminder loop can never do. That loop is a
 * setInterval inside the page, so it only ticks while ClassPing is open — which
 * is exactly not the case when someone is walking out of a lecture hall. A push
 * wakes this worker up with the app closed.
 */

const ICON = "/icons/icon-192.png";

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* malformed payload — fall through to the generic notification below */
  }

  // A push event MUST end in a visible notification: if we don't show one, the
  // browser shows its own "this site was updated in the background" message.
  event.waitUntil(
    self.registration.showNotification(data.title || "ClassPing", {
      body: data.body || "",
      tag: data.tag,
      icon: ICON,
      badge: ICON,
      // Carried through to notificationclick — it's how the handler below knows
      // where "Yes" goes and what to say for "No".
      data,
      // Hold it on screen until they answer rather than fading away unseen.
      requireInteraction: true,
      // Android/Chrome/Firefox render these as buttons. iOS Safari ignores the
      // array entirely — see the body-tap path in notificationclick, which is
      // what carries the interaction there.
      actions:
        data.kind === "post-class"
          ? [
              { action: "yes", title: "Yes, add it" },
              { action: "no", title: "No" },
            ]
          : [],
    }),
  );
});

/** Focus an existing ClassPing window and route it, or open a new one. */
async function openApp(url) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if ("navigate" in client) {
      await client.focus();
      return client.navigate(url);
    }
  }
  return self.clients.openWindow(url);
}

/** The "No" sign-off: a brief reply on the lock screen, no app launch. */
async function signOff(data) {
  const tag = `${data.tag || "post-class"}:done`;
  await self.registration.showNotification("Nice — nothing to log 🎉", {
    body: data.dismiss || "Have a great rest of your day 👋",
    tag,
    icon: ICON,
    badge: ICON,
  });
  // It's an acknowledgement, not something to act on — clear it rather than
  // leaving it parked on the lock screen for the rest of the day.
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const shown = await self.registration.getNotifications({ tag });
  for (const n of shown) n.close();
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  // Locally-scheduled reminders (class starting, task due) carry no payload —
  // keep their original behaviour of just opening the app.
  if (data.kind !== "post-class") {
    event.waitUntil(openApp("/home"));
    return;
  }

  if (event.action === "no") {
    event.waitUntil(signOff(data));
    return;
  }

  // "Yes" goes straight to Add Assignment, prefilled with the class.
  if (event.action === "yes") {
    event.waitUntil(openApp(data.url || "/tasks/new"));
    return;
  }

  // No action — they tapped the notification body. That's ambiguous, and on iOS
  // it's the *only* thing that can happen, because Safari never drew the two
  // buttons. So ask the question properly instead of assuming an answer.
  event.waitUntil(openApp(data.promptUrl || "/prompt"));
});
