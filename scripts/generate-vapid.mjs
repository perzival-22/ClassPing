/**
 * Generates a VAPID keypair for Web Push.
 *
 *   node scripts/generate-vapid.mjs
 *
 * Run this ONCE. The keypair is the server's identity to every push service
 * (FCM, Mozilla, Apple) — rotating it invalidates every existing subscription,
 * so every user would silently stop receiving notifications until they
 * re-subscribed. Keep the private key out of git and out of any NEXT_PUBLIC_
 * variable; only the public key is safe to ship to the browser.
 */

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
VAPID keypair generated. Add these to .env.local and to the Vercel project
(Settings -> Environment Variables, all environments):

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:you@example.com

Set VAPID_SUBJECT to a real mailto: or https: URL you control — push services
use it to contact you if your pushes start misbehaving.
`);
