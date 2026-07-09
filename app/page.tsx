"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { PhoneFrame } from "@/components/PhoneFrame";
import { SignInSkeleton } from "@/components/Skeleton";
import { EyeIcon } from "@/components/icons";
import { useStore } from "@/lib/store";

function clerkErrorMessage(err: unknown): string {
  const first = (err as { errors?: { message?: string }[] })?.errors?.[0];
  return first?.message ?? "Something went wrong. Please try again.";
}

/** Only allow redirecting back to a same-site path — never an absolute/external URL. */
function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/home";
  return raw;
}

export default function SignInScreen() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setProfile } = useStore();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const {
    signIn,
    setActive: setActiveSignIn,
    isLoaded: signInLoaded,
  } = useSignIn();
  const {
    signUp,
    setActive: setActiveSignUp,
    isLoaded: signUpLoaded,
  } = useSignUp();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [view, setView] = useState<"form" | "verify">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  // A returning user often still has a live Clerk session even though the PWA
  // reopens on this screen — send them straight in instead of showing the form
  // (signIn.create() would fail with "session already exists").
  useEffect(() => {
    if (authLoaded && isSignedIn) {
      router.replace(safeRedirect(searchParams.get("redirect_url")));
    }
  }, [authLoaded, isSignedIn, router, searchParams]);

  if (!authLoaded || isSignedIn) {
    return <SignInSkeleton />;
  }

  async function finishAuth(sessionId: string, activate: (params: { session: string }) => Promise<void>) {
    await activate({ session: sessionId });
    const username = email.split("@")[0] || email.trim();
    setProfile({ username });
    router.push(safeRedirect(searchParams.get("redirect_url")));
  }

  async function handleLogin() {
    if (!signIn || !setActiveSignIn || !canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete" && result.createdSessionId) {
        await finishAuth(result.createdSessionId, setActiveSignIn);
      } else {
        setError("Additional verification is required for this account.");
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    if (!signUp || !canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setView("verify");
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!signUp || !setActiveSignUp || code.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (result.status === "complete" && result.createdSessionId) {
        await finishAuth(result.createdSessionId, setActiveSignUp);
        return;
      }

      // The code was accepted (email is now verified) but the sign-up isn't
      // "complete", so Clerk hasn't created the user. This is almost always a
      // production-instance setting requiring more than we collect — surface
      // exactly what's missing instead of blaming the code.
      const missing = [
        ...(result.missingFields ?? []),
        ...(result.unverifiedFields ?? []),
      ];
      if (missing.length > 0) {
        setError(
          `Email verified, but your account needs: ${missing.join(", ")}. ` +
            `Adjust your Clerk sign-up requirements.`,
        );
      } else {
        setError(
          `Couldn't finish sign-up (status: ${result.status}). Please try again.`,
        );
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(strategy: "oauth_google") {
    if (!signIn) return;
    setError(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: safeRedirect(searchParams.get("redirect_url")),
      });
    } catch (err) {
      setError(clerkErrorMessage(err));
    }
  }

  function handleSubmit() {
    if (mode === "login") handleLogin();
    else handleSignup();
  }

  function backToForm() {
    setView("form");
    setCode("");
    setError(null);
  }

  return (
    <PhoneFrame>
      <div
        className="no-scrollbar h-full overflow-y-auto"
        style={{ background: "var(--bg-signin)" }}
      >
        <div className="flex min-h-full flex-col px-7 pb-10">
        <div className="flex flex-1 flex-col items-center justify-center pt-8">
          <div
            className="brand-logo-grad flex h-[84px] w-[84px] items-center justify-center rounded-[25px] text-white"
            style={{ boxShadow: "0 14px 30px rgba(var(--brand-rgb),.4)" }}
          >
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.2a4.8 4.8 0 00-4.8 4.8c0 4.6-1.9 5.8-1.9 5.8h13.4s-1.9-1.2-1.9-5.8A4.8 4.8 0 0012 3.2z"
                fill="#fff"
              />
              <path
                d="M10.3 19.4a2 2 0 003.4 0"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="mt-[22px] font-[family-name:var(--font-fredoka)] text-[36px] font-semibold leading-none text-ink">
            ClassPing
          </h1>
          <p className="mt-2 max-w-[230px] text-center text-[15px] leading-snug text-muted">
            Your classes and deadlines, right on time.
          </p>

          {view === "form" ? (
            <>
              {/* segmented control */}
              <div className="mt-9 flex w-full rounded-[14px] bg-[#E3E0F2] p-1" style={{ background: "var(--bg-card)" }}>
                {(["login", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className="flex-1 rounded-[11px] py-[10px] text-[15px] transition"
                    style={
                      mode === m
                        ? {
                            background: "var(--color-brand, #5B54E8)",
                            fontWeight: 600,
                            color: "#fff",
                            boxShadow: "0 1px 3px rgba(0,0,0,.15)",
                          }
                        : { fontWeight: 500, color: "var(--color-muted)" }
                    }
                  >
                    {m === "login" ? "Log in" : "Sign up"}
                  </button>
                ))}
              </div>

              {/* fields */}
              <div className="mt-4 flex w-full flex-col gap-3">
                <label
                  className="rounded-[15px] bg-white px-4 py-[13px]"
                  style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
                >
                  <div className="text-[11px] font-semibold tracking-wide text-faint">
                    EMAIL
                  </div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-[3px] w-full bg-transparent text-[16px] text-ink outline-none"
                    placeholder="student@gmail.com"
                    autoComplete="email"
                    type="email"
                    inputMode="email"
                  />
                </label>

                <label
                  className="flex items-center justify-between rounded-[15px] bg-white px-4 py-[13px]"
                  style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold tracking-wide text-faint">
                      PASSWORD
                    </div>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPw ? "text" : "password"}
                      placeholder="••••••••"
                      className="mt-[3px] w-full bg-transparent text-[16px] tracking-wide text-ink outline-none placeholder:tracking-normal"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label="Toggle password visibility"
                    className="pl-3 text-hint"
                  >
                    <EyeIcon className="h-[22px] w-[22px]" />
                  </button>
                </label>
              </div>

              {/* Clerk renders its bot-protection challenge into this element when required */}
              <div id="clerk-captcha" className="mt-2 w-full" />

              {error && (
                <p className="mt-3 w-full text-center text-[13px] font-medium text-[#E84040]">
                  {error}
                </p>
              )}

              {/* divider */}
              <div className="mt-5 flex w-full items-center gap-3">
                <div className="h-px flex-1 bg-black/10" />
                <span className="text-[12px] font-medium text-faint">OR</span>
                <div className="h-px flex-1 bg-black/10" />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={() => handleOAuth("oauth_google")}
                disabled={!signInLoaded}
                className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-[15px] bg-white px-4 py-[13px] text-[15px] font-semibold text-ink transition active:scale-[0.98] disabled:opacity-50"
                style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
                  />
                </svg>
                Continue with Google
              </button>
            </>
          ) : (
            <div className="mt-9 w-full text-center">
              <p className="text-[15px] leading-snug text-muted">
                We sent a 6-digit code to
                <br />
                <span className="font-semibold text-ink">{email}</span>
              </p>

              <label
                className="mt-6 block rounded-[15px] bg-white px-4 py-[13px] text-left"
                style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
              >
                <div className="text-[11px] font-semibold tracking-wide text-faint">
                  VERIFICATION CODE
                </div>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-[3px] w-full bg-transparent text-[16px] tracking-[0.3em] text-ink outline-none"
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
              </label>

              {error && (
                <p className="mt-3 text-center text-[13px] font-medium text-[#E84040]">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={backToForm}
                className="mt-4 text-[14px] font-semibold text-brand"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>

        <button
          onClick={view === "form" ? handleSubmit : handleVerify}
          disabled={
            loading ||
            (view === "form"
              ? !canSubmit
              : code.trim().length === 0 || !signUpLoaded)
          }
          className="btn-brand w-full rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {view === "verify"
            ? loading
              ? "Verifying…"
              : "Verify email"
            : loading
              ? mode === "login"
                ? "Logging in…"
                : "Creating account…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
        </button>
        {view === "form" && (
          <p className="mt-[18px] text-center text-[14px] text-muted">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
              className="font-semibold text-brand"
            >
              {mode === "login" ? "Create an account" : "Log in"}
            </button>
          </p>
        )}
        </div>
      </div>
    </PhoneFrame>
  );
}
