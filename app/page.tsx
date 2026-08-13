"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { PhoneFrame } from "@/components/PhoneFrame";
import { SignInSkeleton } from "@/components/Skeleton";
import { EyeIcon } from "@/components/icons";
import { PALETTE, type SubjectColor } from "@/lib/palette";
import { useStore } from "@/lib/store";

/**
 * One selling point in the public landing strip. On the phone it's a row in a
 * list below the form; from `lg` up it's a feature card in the left column,
 * with the emoji promoted into a tinted blob like the class icons on Home.
 */
function ValueProp({
  icon,
  title,
  body,
  tint,
}: {
  icon: string;
  title: string;
  body: string;
  /** Subject color for the desktop icon blob — the app's own palette. */
  tint: SubjectColor;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-[15px] bg-white px-4 py-3.5 lg:items-center lg:gap-4 lg:px-5 lg:py-4"
      style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
    >
      <span
        className="text-[19px] leading-none lg:flex lg:h-[42px] lg:w-[42px] lg:shrink-0 lg:items-center lg:justify-center lg:rounded-[13px] lg:bg-[var(--vp-tint)] lg:text-[21px]"
        style={{ "--vp-tint": PALETTE[tint].bg } as React.CSSProperties}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-ink lg:text-[15px]">
          {title}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted lg:text-[13.5px]">
          {body}
        </p>
      </div>
    </div>
  );
}

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

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  /**
   * How long the skeleton is allowed to stand in for Clerk.
   *
   * Long enough that a normal load never reaches it, so a returning user is
   * redirected without ever seeing the form; short enough that somebody on a
   * bad connection gets something they can read and type into rather than
   * concluding the app is broken.
   */
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (authLoaded) return;
    const t = setTimeout(() => setAuthTimedOut(true), 2500);
    return () => clearTimeout(t);
  }, [authLoaded]);

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;
  /*
   * Whichever half of Clerk this view is about to call.
   *
   * Load can now be reached before Clerk is ready — that is the whole point of
   * the grace period below — so the button has to say "not yet" rather than
   * look live and do nothing. `handleLogin` already returns early without
   * `signIn`, which as a *disabled* state is correct and as a *tap* is a button
   * that silently ignores you.
   */
  const clerkReady = mode === "login" ? signInLoaded : signUpLoaded;
  const submitDisabled =
    loading ||
    !clerkReady ||
    (view === "form" ? !canSubmit : code.trim().length === 0);

  // A returning user often still has a live Clerk session even though the PWA
  // reopens on this screen — send them straight in instead of showing the form
  // (signIn.create() would fail with "session already exists").
  useEffect(() => {
    if (authLoaded && isSignedIn) {
      router.replace(safeRedirect(searchParams.get("redirect_url")));
    }
  }, [authLoaded, isSignedIn, router, searchParams]);

  // Desktop lands with the cursor already in the field that matters. Only
  // there: on a phone this would throw up the soft keyboard and shove the
  // layout around before anyone has decided they want an account.
  useEffect(() => {
    if (!authLoaded || isSignedIn) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    (view === "form" ? emailRef : codeRef).current?.focus();
  }, [authLoaded, isSignedIn, view]);

  /*
   * The skeleton waits for Clerk, but not forever.
   *
   * It used to wait on `!authLoaded` with nothing behind it. Until Clerk's
   * script had downloaded, parsed and initialised — on a phone, over cellular,
   * behind whatever else the tab was fetching — this screen rendered nothing at
   * all. There was no timeout and no error path, so a slow Clerk load was
   * indistinguishable from a broken app: just a skeleton, indefinitely.
   *
   * Dropping the wait outright is the wrong fix. `authLoaded` is also what
   * tells us whether the person already has a session, and a returning user is
   * common enough here that showing them a login form for a moment before
   * redirecting them away from it is its own bug.
   *
   * So the wait is *bounded*. Inside the grace period the skeleton behaves as
   * it always did and a returning user never sees a form. Past it, Clerk is
   * taking long enough that a blank screen is the worse answer, and the form
   * appears with its submit button still gated on `signInLoaded` — typing an
   * email and a password takes longer than the rest of Clerk's load, so in
   * practice the button is live by the time anyone reaches it.
   */
  if ((!authLoaded && !authTimedOut) || isSignedIn) {
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitDisabled) return;
    if (view === "verify") handleVerify();
    else if (mode === "login") handleLogin();
    else handleSignup();
  }

  function backToForm() {
    setView("form");
    setCode("");
    setError(null);
  }

  return (
    <PhoneFrame chrome={false} wide>
      <div
        className="no-scrollbar h-full overflow-y-auto"
        style={{ background: "var(--bg-signin)" }}
      >
        {/*
          One document, two rooms.

          On the phone this is the column it always was: brand, form, then the
          strip that says what ClassPing is. From `lg` up it splits — the pitch
          takes the left, the form takes a fixed 400px on the right, and the
          whole thing sits in one screenful instead of a 460px ribbon of
          scrolling stranded in the middle of a monitor.

          The split can't be a wrapper per side, because on the phone the two
          halves of the pitch straddle the form: the wordmark has to come before
          it and the value props after. So the pitch is `contents` below the
          breakpoint — it stops being a box and its children flow as siblings of
          the form, ordered around it — and becomes a real column at `lg`. One
          DOM, no duplicated inputs, no second #clerk-captcha.

          `lg`, not the `md` the sidebar uses: a 400px form beside a 768px
          viewport leaves the pitch 300px, which is narrower than the phone.
        */}
        <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col justify-center px-7 pb-10 pt-8 lg:max-w-[1060px] lg:flex-row lg:items-center lg:gap-20 lg:px-12 lg:py-12 xl:gap-24">
          {/* ── the pitch ─────────────────────────────────────────
              Capped rather than fluid, and the pair is centred: left to grow,
              the pitch would push the form to the far edge of a wide monitor
              and the two halves would stop reading as one page. */}
          <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:items-start lg:max-w-[540px]">
            {/* Stacked and centred on the phone; a wordmark on one line here,
                because the headline below is what should carry the width. */}
            <div className="order-1 flex flex-col items-center lg:flex-row lg:items-center lg:gap-3.5">
              <div
                className="brand-logo-grad flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-[25px] text-white lg:h-[54px] lg:w-[54px] lg:rounded-[17px]"
                style={{ boxShadow: "0 14px 30px rgba(var(--brand-rgb),.4)" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-[42px] w-[42px] lg:h-[27px] lg:w-[27px]"
                >
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
              <h1 className="mt-[22px] font-[family-name:var(--font-fredoka)] text-[36px] font-semibold leading-none text-ink lg:mt-0 lg:text-[29px]">
                ClassPing
              </h1>
            </div>

            {/* The same sentence in both rooms — a caption under the wordmark on
                the phone, the headline of the page on a monitor. */}
            <p className="order-1 mx-auto mt-2 max-w-[230px] text-center text-[15px] leading-snug text-muted lg:mx-0 lg:mt-8 lg:max-w-[440px] lg:text-left lg:font-[family-name:var(--font-fredoka)] lg:text-[40px] lg:font-semibold lg:leading-[1.1] lg:text-ink">
              Your classes and deadlines, right on time.
            </p>

            {/* Room for one more line only where there is room for it. */}
            <p className="order-1 mt-4 hidden max-w-[430px] text-[15.5px] leading-relaxed text-muted lg:block">
              Built by a student who kept missing 9 a.m. lectures. Add your
              classes once — ClassPing takes it from there.
            </p>

            {/* This screen is the only public page — a shared link or a search
                result lands here, so it has to say what ClassPing is before
                asking anyone to make an account. Hidden during code entry so it
                never competes with the one thing that matters there. */}
            {view === "form" && (
              <div className="order-3 mt-8 w-full lg:mt-9">
                {/* `--line-strong`, not black/10: a 10%-black rule on a black
                    page is nothing at all, and dark mode is where both of this
                    screen's dividers were quietly missing. */}
                <div className="flex items-center gap-3 lg:hidden">
                  <div className="h-px flex-1 bg-[var(--line-strong)]" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">
                    What you get
                  </span>
                  <div className="h-px flex-1 bg-[var(--line-strong)]" />
                </div>

                <div className="mt-5 flex flex-col gap-3 lg:mt-0">
                  <ValueProp
                    icon="📅"
                    tint="indigo"
                    title="Your week, at a glance"
                    body="Add your classes once. See today's schedule and the full Mon–Fri grid."
                  />
                  <ValueProp
                    icon="✅"
                    tint="teal"
                    title="Nothing slips"
                    body="Track every assignment with real due dates, and tick it off when it's done."
                  />
                  <ValueProp
                    icon="🔔"
                    tint="coral"
                    title="Reminders that reach you"
                    body="A nudge before class starts and before work is due — by push and email."
                  />
                </div>

                {/* `text-muted`, not `text-hint`: on the light gradient the
                    hint grey is about 2:1 against its own background, which is
                    a line of real information rendered as a watermark. */}
                <p className="mt-6 text-center text-[12px] leading-snug text-muted lg:mt-7 lg:text-left lg:text-[13px]">
                  Free to start · Works offline · Installs to your home screen
                </p>
              </div>
            )}
          </div>

          {/* ── the form ──────────────────────────────────────────
              A real <form>, so Enter submits and password managers see a login
              to save. Every other button in here is type="button" — inside a
              form an untyped button is a submit button. */}
          <form
            noValidate
            onSubmit={handleSubmit}
            className="order-2 mt-9 flex w-full flex-col lg:mt-0 lg:w-[400px] lg:shrink-0"
          >
            {view === "form" ? (
              <>
                {/* segmented control */}
                <div
                  className="flex w-full rounded-[14px] p-1"
                  style={{ background: "var(--bg-card)" }}
                >
                  {(["login", "signup"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        setError(null);
                      }}
                      className="flex-1 cursor-pointer rounded-[11px] py-[10px] text-[15px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
                    className="rounded-[15px] bg-white px-4 py-[13px] transition focus-within:outline-2 focus-within:outline-offset-[-1px] focus-within:outline-brand"
                    style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
                  >
                    <div className="text-[11px] font-semibold tracking-wide text-faint">
                      EMAIL
                    </div>
                    <input
                      ref={emailRef}
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
                    className="flex items-center justify-between rounded-[15px] bg-white px-4 py-[13px] transition focus-within:outline-2 focus-within:outline-offset-[-1px] focus-within:outline-brand"
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
                      aria-pressed={showPw}
                      className="cursor-pointer pl-3 text-hint transition hover:text-muted"
                    >
                      <EyeIcon className="h-[22px] w-[22px]" />
                    </button>
                  </label>
                </div>

                {/* Clerk renders its bot-protection challenge into this element
                    when required; `empty:` keeps it from reserving a gap on the
                    usual pass where it renders nothing. */}
                <div id="clerk-captcha" className="mt-2 w-full empty:mt-0" />
              </>
            ) : (
              <div className="w-full text-center">
                <p className="text-[15px] leading-snug text-muted">
                  We sent a 6-digit code to
                  <br />
                  <span className="font-semibold text-ink">{email}</span>
                </p>

                <label
                  className="mt-6 block rounded-[15px] bg-white px-4 py-[13px] text-left transition focus-within:outline-2 focus-within:outline-offset-[-1px] focus-within:outline-brand"
                  style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
                >
                  <div className="text-[11px] font-semibold tracking-wide text-faint">
                    VERIFICATION CODE
                  </div>
                  <input
                    ref={codeRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="mt-[3px] w-full bg-transparent text-[16px] tracking-[0.3em] text-ink outline-none"
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </label>
              </div>
            )}

            {error && (
              <p className="mt-3 w-full text-center text-[13px] font-medium text-[var(--danger)]">
                {error}
              </p>
            )}

            {/* The primary action now sits with the fields it submits rather
                than at the foot of the screen: it is the Enter key's twin, and
                on a desk the two have to be in the same place. */}
            <button
              type="submit"
              disabled={submitDisabled}
              className="btn-brand mt-5 w-full cursor-pointer rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition hover:brightness-[1.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-[0.98] disabled:cursor-default disabled:opacity-50 disabled:hover:brightness-100"
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

            {view === "form" ? (
              <>
                {/* divider */}
                <div className="mt-5 flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--line-strong)]" />
                  <span className="text-[12px] font-medium text-faint">OR</span>
                  <div className="h-px flex-1 bg-[var(--line-strong)]" />
                </div>

                {/* Google */}
                <button
                  type="button"
                  onClick={() => handleOAuth("oauth_google")}
                  disabled={!signInLoaded}
                  className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[15px] bg-white px-4 py-[13px] text-[15px] font-semibold text-ink transition hover:brightness-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
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

                <p className="mt-[18px] text-center text-[14px] text-muted">
                  {mode === "login" ? "New here? " : "Already have an account? "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === "login" ? "signup" : "login");
                      setError(null);
                    }}
                    className="cursor-pointer font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {mode === "login" ? "Create an account" : "Log in"}
                  </button>
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={backToForm}
                className="mt-4 cursor-pointer text-center text-[14px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Use a different email
              </button>
            )}
          </form>
        </div>
      </div>
    </PhoneFrame>
  );
}
