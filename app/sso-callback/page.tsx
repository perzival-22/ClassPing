import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

/**
 * Completes OAuth (Google/Apple) redirects. Every URL is set explicitly so
 * the flow never falls back to Clerk's hosted accounts.dev pages — including
 * the first-time case where an OAuth sign-in transfers into a sign-up.
 * The fallback (not force) variants keep deep links working: a
 * ?redirect_url passed to authenticateWithRedirect still wins.
 */
export default function SSOCallback() {
  return (
    <AuthenticateWithRedirectCallback
      signInUrl="/"
      signUpUrl="/"
      signInFallbackRedirectUrl="/home"
      signUpFallbackRedirectUrl="/home"
      continueSignUpUrl="/"
    />
  );
}
