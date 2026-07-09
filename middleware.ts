import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sso-callback"]);

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
