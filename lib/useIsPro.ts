"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { PRO_PLAN } from "./plan";

/**
 * Client-side Pro check for showing/hiding UI. Reads the plan claim from the
 * Clerk session, which the user cannot forge — but anything that must be
 * enforced (not just displayed) re-checks on the server via lib/entitlements.
 *
 * Also honors comped access via `proAccess: true` in the user's public
 * metadata (set from the Clerk dashboard), mirroring the server check.
 */
export function useIsPro(): { isPro: boolean; proLoaded: boolean } {
  const { isLoaded, has } = useAuth();
  const { user } = useUser();
  const comped = user?.publicMetadata?.proAccess === true;
  return {
    isPro: isLoaded ? (has?.({ plan: PRO_PLAN }) ?? false) || comped : false,
    proLoaded: isLoaded,
  };
}
