import webpush from "web-push";
import { sql } from "./db";

/**
 * Web Push (VAPID) — server side.
 *
 * Standard VAPID: we sign each request with our own keypair and hand it to
 * whichever push service the subscription names (FCM for Chrome, Mozilla's
 * autopush for Firefox, Apple's for Safari). No vendor SDK and no per-message
 * cost — the browser vendors run these endpoints for free.
 *
 * The payload is encrypted to the subscription's own keys, so the push service
 * relays ciphertext it cannot read. web-push does that encryption for us.
 */

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT ?? "mailto:support@classping.space";

/** False when the keys aren't configured — callers degrade instead of throwing. */
export const pushConfigured = Boolean(publicKey && privateKey);

if (pushConfigured) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the service worker's `push` handler expects to find in event.data. */
export interface PushPayload {
  title: string;
  body: string;
  /** Distinguishes notification types in the SW (currently only "post-class"). */
  kind: "post-class";
  /** Where "Yes" goes — the prefilled Add Assignment screen. */
  url: string;
  /**
   * Where a tap on the notification *body* goes — the full-screen Yes/No.
   *
   * A body tap is ambiguous (they engaged but didn't answer), and on iOS it is
   * the only possible interaction, because Safari doesn't render notification
   * action buttons at all. Sending it to /prompt asks the question properly
   * instead of assuming "yes", which is what makes this work on iPhone.
   */
  promptUrl: string;
  /** Groups/replaces notifications so a class can't stack duplicates. */
  tag: string;
  /**
   * The sign-off shown when the user taps "No" — "Have a great day!", or
   * "Enjoy Chemistry at 2:00 PM" when another class is still ahead of them.
   *
   * Computed here rather than in the service worker because the SW has no
   * access to the schedule: it only ever sees this one payload.
   */
  dismiss: string;
}

/**
 * Push one payload to one device.
 *
 * Returns false when the subscription is gone for good (410 Gone / 404), having
 * already deleted it. Every push service hands those back once a user uninstalls
 * the PWA or clears site data, and a subscription that's dead stays dead — so
 * pruning here is what stops the table filling with endpoints we'll never reach
 * and burning a request on each cron run forever.
 */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<boolean> {
  if (!pushConfigured) return false;

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      // The push service holds the message this long if the device is offline.
      // A post-class nudge is worthless tomorrow, so let it expire in 2h.
      { TTL: 7200, urgency: "normal" },
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      if (sql) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
      }
      return false;
    }
    // Anything else (429, 5xx, network) is transient: leave the subscription in
    // place and let the next run retry rather than dropping a live device.
    console.error("[push] send failed", status ?? err);
    return false;
  }
}
