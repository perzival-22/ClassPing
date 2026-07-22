import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * The cron endpoints are public *to the middleware* only. They have no Clerk
 * session to protect — the scheduler calls them machine-to-machine — so they
 * authenticate themselves against CRON_SECRET instead, and reject anything
 * without that bearer token. Leaving them behind auth.protect() would bounce
 * the cron to the sign-in page and the job would never run at all.
 *
 * The email routes are public for the same shape of reason: both are reached
 * by tapping a link inside an email client, where no Clerk session exists.
 * The unsubscribe link carries its own HMAC proof of ownership instead.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sso-callback",
  "/api/cron/(.*)",
  "/api/email/unsubscribe",
  "/email/dismissed",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Always bounce signed-out visitors to our own sign-in screen (never
    // Clerk's hosted accounts.dev page), remembering where they were headed —
    // the sign-in page reads ?redirect_url after auth completes.
    const signInUrl = new URL("/", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
    await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
