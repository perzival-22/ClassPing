import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * The cron endpoint is public *to the middleware* only. It has no Clerk session
 * to protect — Vercel Cron calls it machine-to-machine — so it authenticates
 * itself against CRON_SECRET instead, and rejects anything without that bearer
 * token. Leaving it behind auth.protect() would bounce the cron to the sign-in
 * page and the job would never run at all.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sso-callback",
  "/api/cron/(.*)",
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
