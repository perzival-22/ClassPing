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
 * Cache generations are named after the deploy (see CACHE_VERSION below), so
 * every release starts clean and `activate` deletes the generation before it.
 * There is no version constant to remember to bump.
 */

/**
 * The deploy this worker belongs to, read off its own registration URL
 * (`/sw.js?v=<build id>`, set in lib/notifications.ts).
 *
 * This file's bytes are identical from one release to the next, so the browser
 * would never see a new worker and `activate` — the only thing that deletes old
 * caches — would never run again after the first install. Hashed asset names
 * change every build, so that meant the static cache accumulated every chunk
 * ever shipped, with nothing able to evict them. Keying the cache names on the
 * build makes each release start clean and drop the one before it.
 */
const CACHE_VERSION = new URL(self.location.href).searchParams.get("v") || "v1";
const STATIC_CACHE = `classping-static-${CACHE_VERSION}`;
const PAGES_CACHE = `classping-pages-${CACHE_VERSION}`;
/**
 * Pet art, deliberately *not* keyed on the build: the files are immutable and
 * far too big to re-download every deploy just because a chunk hash moved.
 *
 * The suffix is therefore the one thing that can ever evict them, and it is
 * bumped by hand when the set changes — `activate` deletes every cache it does
 * not recognise, so the generation before it goes with it rather than sitting
 * on disk forever with nothing left that can request it.
 *
 * v3: the five families. v2 held six ghost portraits, and v1 the five that
 * preceded them at their original resolution.
 */
const ART_CACHE = "classping-art-v3";

/** Cap the page cache so a long semester of browsing can't grow it unbounded. */
const MAX_PAGES = 30;
/**
 * And cap the static one. Versioning already bounds it per deploy, but a single
 * long session can still touch every lazily-loaded route chunk, and a belt here
 * is cheap insurance against a future rule that caches more than it should.
 */
const MAX_STATIC = 160;

/** Available offline even on the very first launch. */
const PRECACHE = ["/icons/icon-192.png", "/icons/icon-512.png"];
/**
 * The pet ladder, all twenty-seven of them (lib/pet.ts).
 *
 * Warmed at install rather than on demand because the shelf draws the whole
 * collection at once — including the rungs you haven't earned — so the first
 * time somebody opens it offline is exactly when every one of these is needed.
 * The set is ~1.8MB, which is the reason each file is a 512px crop rather than
 * the 2048px original it was drawn at.
 *
 * A test in lib/pet.test.ts holds this list to the ladder, element for element,
 * because a portrait that 404s offline is indistinguishable from a rung that
 * hasn't been earned.
 */
const PRECACHE_ART = [
  "/pet/pet_common.jpg",
  "/pet/pet_bronze.jpg",
  "/pet/pet_silver.jpg",
  "/pet/pet_gold.jpg",
  "/pet/pet_galaxy.jpg",
  "/pet/ghost_common.jpg",
  "/pet/ghost_bronze.jpg",
  "/pet/ghost_rare.jpg",
  "/pet/ghost_silver.jpg",
  "/pet/ghost_gold.jpg",
  "/pet/ghost_galaxy.jpg",
  "/pet/ember_common.jpg",
  "/pet/ember_bronze.jpg",
  "/pet/ember_rare.jpg",
  "/pet/ember_silver.jpg",
  "/pet/crystal_common.jpg",
  "/pet/crystal_bronze.jpg",
  "/pet/crystal_rare.jpg",
  "/pet/crystal_silver.jpg",
  "/pet/crystal_gold.jpg",
  "/pet/crystal_galaxy.jpg",
  "/pet/astral_common.jpg",
  "/pet/astral_bronze.jpg",
  "/pet/astral_rare.jpg",
  "/pet/astral_silver.jpg",
  "/pet/astral_gold.jpg",
  "/pet/astral_galaxy.jpg",
];

/**
 * Screens worth having ready before they're asked for.
 *
 * These are the tab-bar destinations. Warming them at install means the first
 * offline launch opens on any of them, and — with the stale-while-revalidate
 * rule below — the first *online* visit to each paints from cache instead of
 * waiting on the server.
 *
 * Signed out, every one of these 302s to the sign-in page, and `isCacheable`
 * rejects a redirected response — so this quietly does nothing until there's a
 * session, which is exactly right.
 */
const PRECACHE_PAGES = [
  "/home",
  "/classes",
  "/week",
  "/tasks",
  "/settings",
];

/** Fetch and store one URL, tolerating failure. Returns nothing either way. */
async function warm(cacheName, url) {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (isCacheable(res)) {
      const cache = await caches.open(cacheName);
      await cache.put(url, res);
    }
  } catch {
    /* offline at install, or auth-redirected — neither is worth reporting */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Icons must be there; pages are a bonus. Neither may block activation,
      // so every one of these is individually best-effort.
      await Promise.all([
        ...PRECACHE.map((u) => warm(STATIC_CACHE, u)),
        ...PRECACHE_ART.map((u) => warm(ART_CACHE, u)),
        ...PRECACHE_PAGES.map((u) => warm(PAGES_CACHE, u)),
      ]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE && k !== ART_CACHE)
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
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/pet/")
  ) {
    const isArt = url.pathname.startsWith("/pet/");
    const targetCache = isArt ? ART_CACHE : STATIC_CACHE;
    
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (isCacheable(res)) {
              const copy = res.clone();
              event.waitUntil(
                caches.open(targetCache).then(async (c) => {
                  await c.put(request, copy);
                  if (!isArt) {
                    await trim(STATIC_CACHE, MAX_STATIC);
                  }
                }),
              );
            }
            return res;
          }),
      ),
    );
    return;
  }

  /*
   * Pages: stale-while-revalidate.
   *
   * The cached shell is served immediately and the network runs behind it to
   * refresh the copy for next time. This used to be network-first, which meant
   * every screen open — including ones we already had on disk — waited a full
   * round trip before painting anything.
   *
   * What we cache is a *shell*: the store hydrates the actual classes, tasks
   * and grades from localStorage after mount, so a stale entry can't show stale
   * data, only a stale frame around fresh data. Two consequences are worth
   * being explicit about:
   *
   *   - A session that expired since the page was cached will paint the app for
   *     a moment before Clerk redirects to sign-in. That is the cost of this
   *     strategy, accepted deliberately.
   *   - On a shared device the shell must not outlive its user, which is what
   *     the signout handler at the bottom of this file is for — it drops the
   *     whole page cache.
   *
   * A redirected response is never stored (see `isCacheable`), so the sign-in
   * page can never end up pinned under the /home key.
   */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        // The clone is taken the instant the response lands, in the same tick,
        // before anything can begin reading the body — a clone attempted later
        // (once the browser is streaming the original to the page) throws.
        const network = fetch(request).then(
          (res) => ({ res, copy: isCacheable(res) ? res.clone() : null }),
          () => null,
        );

        // Registered exactly once, unconditionally, so the worker is kept alive
        // for the write whether or not we end up serving from cache. Calling
        // waitUntil later — after respondWith has already settled on the cached
        // copy — would be too late and would throw.
        event.waitUntil(
          network.then(async (r) => {
            if (!r || !r.copy) return;
            const c = await caches.open(PAGES_CACHE);
            await c.put(request, r.copy);
            await trim(PAGES_CACHE, MAX_PAGES);
          }),
        );

        // The fast path: paint what we have, let the refresh land behind it.
        if (cached) return cached;

        // A genuine first visit to this URL — nothing to be stale with.
        const r = await network;
        if (r) return r.res;

        // Offline with no copy of this page: fall back to any shell we have so
        // the app opens rather than showing the browser's error page.
        return (
          (await caches.match("/home")) ||
          (await caches.match("/")) ||
          Response.error()
        );
      })(),
    );
  }
});

/* ── Sign-out cleanup ───────────────────────────────────────────────────────
 *
 * The page cache holds server-rendered app shells (e.g. /home). On a shared
 * device, user B going offline could otherwise be served user A's cached shell
 * from the offline fallback. The payload is thin — a shell, not the
 * localStorage data — but it's still A's screen, so we drop the whole page
 * cache when the app tells us someone signed out.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type === "signout") {
    event.waitUntil(caches.delete(PAGES_CACHE));
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
