import { auth, currentUser } from "@clerk/nextjs/server";
import { PRO_PLAN } from "./plan";

/**
 * Server-verified entitlement check. This is the source of truth — client-side
 * checks (useIsPro) are for UI only and must never gate anything that matters.
 *
 * Pro is granted by a paid subscription, or by comped access: set
 * `{ "proAccess": true }` in the user's public metadata from the Clerk
 * dashboard (Users → user → Metadata → Public). Users can't set this
 * themselves — public metadata is only writable from the dashboard/backend.
 */
export async function isPro(): Promise<boolean> {
  const { userId, has } = await auth();
  if (!userId) return false;
  if (has({ plan: PRO_PLAN })) return true;
  const user = await currentUser();
  return user?.publicMetadata?.proAccess === true;
}
