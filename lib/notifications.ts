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
