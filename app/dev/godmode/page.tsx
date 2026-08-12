import { notFound } from "next/navigation";
import { GodmodePanel } from "./GodmodePanel";

/**
 * Godmode, behind a door that does not exist in production.
 *
 * The gate is a server-side `notFound()` rather than a hidden button or an
 * environment check inside the client component. Both of those ship the route
 * to real users and rely on nobody finding it; this one makes `/dev/godmode`
 * a genuine 404 in any build that isn't `next dev`, so the seeding code can
 * never be reached by a student who guessed a URL.
 *
 * It sits behind Clerk as well, because every route except `/` does — see
 * middleware.ts. That is left alone deliberately: a dev-only route that also
 * punched a hole in auth would be two exemptions where one will do.
 */
export default function GodmodePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GodmodePanel />;
}
