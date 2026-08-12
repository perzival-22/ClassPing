import { notFound } from "next/navigation";
import { godmodeAllowed } from "@/lib/godmodeAccess";
import { GodmodePanel } from "./GodmodePanel";

/**
 * Godmode, behind a door that opens for a named list and nobody else.
 *
 * The gate is a server-side `notFound()` rather than a hidden button or a
 * check inside the client component: both of those ship the panel to the
 * browser and rely on nobody looking. This renders a real 404 instead, so the
 * seeding code is never sent to a browser that isn't allowed to run it.
 *
 * Reading the signed-in user makes this route dynamic, which is correct and
 * deliberate — the answer depends on who is asking, so it cannot be baked at
 * build time. See lib/godmodeAccess.ts for who gets in and why it is an
 * allowlist rather than the `NODE_ENV` check this used to be.
 *
 * It sits behind Clerk as well, because every route except `/` does (see
 * middleware.ts) — which is also what guarantees `currentUser()` has somebody
 * to look up by the time this runs.
 */
export default async function GodmodePage() {
  if (!(await godmodeAllowed())) notFound();
  return <GodmodePanel />;
}
