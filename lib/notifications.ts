/**
 * Web-notification helpers. Reminders are scheduled client-side by the store's
 * reminder loop (lib/store.tsx) and delivered through the service worker when
 * available, so they also work in the installed-PWA context.
 */

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* SW is progressive enhancement — ignore registration failures */
  });
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Resolves true when the user has granted (or grants) notification permission. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Same `tag` replaces an earlier notification instead of stacking a new one. */
export async function showReminder(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const options = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    const reg =
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
    if (reg) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    /* never let a failed notification break the app */
  }
}

/* ── Web Push (VAPID) ──────────────────────────────────────────────────────
 *
 * Everything above only fires while the app is open — it's a timer inside the
 * page. Push is the part that reaches the user when ClassPing is closed, which
 * is the only moment the post-class prompt is actually useful.
 */

/** The VAPID public key is safe to ship to the browser; the private key is not. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

/**
 * The browser wants the VAPID key as a Uint8Array, but it travels as a
 * base64url string — and `atob` only speaks standard base64, so restore the
 * `+/` alphabet and the padding it dropped.
 *
 * The return type is pinned to `Uint8Array<ArrayBuffer>` because
 * `applicationServerKey` won't accept a view that might be backed by a
 * SharedArrayBuffer, which is what a bare `Uint8Array` now widens to.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** True when this device is already registered for push. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

/**
 * Register this device for push and hand the subscription to our server.
 *
 * Note for iOS: `PushManager` only exists once the PWA has been installed to
 * the home screen. In a plain Safari tab this returns false no matter what the
 * user does — hence the install tutorial, and hence `pushSupported()` gating
 * the UI rather than showing a button that can't work.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (!(await ensureNotificationPermission())) return false;

  try {
    const reg = await navigator.serviceWorker.ready;

    // Reuse an existing subscription if the browser already has one: calling
    // subscribe() twice with the same key returns the same endpoint anyway, and
    // this saves a round trip.
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        // Required: the payload is encrypted end-to-end and Chrome rejects
        // silent pushes outright.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      }));

    // The server stores class times as minutes-from-midnight with no timezone,
    // so it can't know when "class ended" without knowing where we are.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sub.toJSON(), tz }),
    });
    if (!res.ok) {
      // The server won't push to a subscription it failed to record, so don't
      // leave the browser believing it's subscribed.
      await sub.unsubscribe().catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Unregister this device, both in the browser and on our server. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;

    // Tell the server first: once we've unsubscribed locally the endpoint is
    // gone and we'd have nothing left to identify the row by.
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {
      /* offline — the server prunes dead endpoints on its next send anyway */
    });

    await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
