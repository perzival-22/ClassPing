import { currentUser } from "@clerk/nextjs/server";

/**
 * Who is allowed through the godmode door.
 *
 * The seed started life gated on `NODE_ENV`, which is the right gate for a
 * seeding tool and the wrong one for this particular seeding tool: the whole
 * reason it exists is to look at screens, and half the screens worth looking at
 * — the phone's read-only note view above all — only exist on a phone. A phone
 * talks to the deployed app, where `NODE_ENV` is always "production", so a
 * dev-only door is a door you can never open from the device you need it on.
 *
 * So the gate is an allowlist of email addresses instead, and it is *closed by
 * default*: with `GODMODE_EMAILS` unset the answer is no for everybody,
 * including whoever is signed in. Only an address named in that variable gets
 * the page, and the variable is only settable by whoever controls the
 * deployment's environment.
 *
 * ── What is actually at risk here ───────────────────────────────────────────
 *
 * Less than it first looks, which is why an allowlist is proportionate rather
 * than lazy. Godmode writes one thing: the signed-in user's own document. It
 * cannot read, reach or damage anybody else's — there is no id to swap and no
 * query to aim. The worst a leaked door does is let someone overwrite their own
 * planner with a fake one, which the Clear button already undoes.
 *
 * The reason it is still gated: a planner full of invented classes is a
 * confusing thing to hand a real student who tapped a URL, and if they are Pro
 * it syncs, so "undo" costs them a round trip rather than nothing. That is a
 * product-hygiene problem, and an allowlist is the proportionate answer to a
 * product-hygiene problem.
 */

/**
 * Is this address on the list? Pure, so the parsing is testable without Clerk.
 *
 * Case- and whitespace-insensitive, because an allowlist that fails on a
 * trailing space in an env var is an allowlist that gets "fixed" by being
 * loosened. An empty or missing list denies everyone.
 */
export function emailAllowed(
  email: string | undefined | null,
  raw: string | undefined,
): boolean {
  const allowed = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;

  const normalised = email?.trim().toLowerCase();
  if (!normalised) return false;
  return allowed.includes(normalised);
}

/**
 * The live check. Localhost stays open so `npm run dev` needs no configuration;
 * everywhere else has to be on the list.
 */
export async function godmodeAllowed(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;

  // Only reached in a deployed build, so the Clerk lookup is never on the
  // path of a local dev render.
  const user = await currentUser();
  return emailAllowed(
    user?.primaryEmailAddress?.emailAddress,
    process.env.GODMODE_EMAILS,
  );
}
