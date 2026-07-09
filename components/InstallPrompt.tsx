"use client";

/**
 * "Add to Home Screen" nudge. Shown once, after login, on the home screen —
 * only to users who are browsing in a tab (not the installed PWA) on a phone.
 * Tapping "Show me how" opens a small muted, looping 10s tutorial clip that
 * matches the user's platform (Safari on iOS, Chrome on Android). Dismissal is
 * remembered so the banner doesn't nag on every visit.
 */

import { useEffect, useState } from "react";
import { ArrowRightIcon } from "./icons";

const DISMISS_KEY = "classping.install.dismissed.v1";

type Platform = "ios" | "android" | null;

/** iOS = install via Safari's Share sheet; Android = Chrome's Install app menu. */
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return null;
}

/** Already running as an installed PWA? Then there's nothing to teach. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const COPY = {
  ios: {
    src: "/tutorials/install-ios.mp4",
    steps: ["Tap the Share button", "Choose “Add to Home Screen”", "Tap “Add” — done!"],
  },
  android: {
    src: "/tutorials/install-android.mp4",
    steps: ["Tap the ⋮ menu", "Choose “Install app”", "Tap “Install” — done!"],
  },
} as const;

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* private mode — treat as not dismissed */
    }
    if (dismissed) return;
    const p = detectPlatform();
    if (!p) return; // desktop / unknown — the phone tutorial doesn't apply
    setPlatform(p);
    setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!visible || !platform) return null;
  const copy = COPY[platform];

  return (
    <>
      {/* ── banner card (sits just above the tab bar) ── */}
      {!open && (
        <div className="absolute inset-x-3 bottom-[92px] z-[55] animate-[skeleton-in_0.3s_ease-out]">
          <div
            className="glass flex items-center gap-3 rounded-[18px] px-3.5 py-3"
            style={{ boxShadow: "0 12px 30px rgba(30,20,80,.16)" }}
          >
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[19px]"
              style={{ background: "var(--brand-grad-v)" }}
            >
              📲
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-ink">
                Add ClassPing to your home screen
              </div>
              <div className="mt-[1px] truncate text-[12px] text-muted">
                Open it like a real app — watch the 10s how-to
              </div>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-white transition active:scale-95"
              style={{ background: "var(--brand-grad-v)" }}
            >
              Show me
              <ArrowRightIcon className="h-[15px] w-[15px]" />
            </button>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-95"
              style={{ background: "rgba(30,20,80,.06)" }}
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── tutorial modal (small video window) ── */}
      {open && (
        <div
          className="absolute inset-0 z-[70] flex flex-col items-center justify-center px-6"
          style={{ background: "rgba(20,16,50,.55)", backdropFilter: "blur(4px)" }}
          onClick={dismiss}
        >
          <div
            className="w-full max-w-[300px] rounded-[24px] bg-white p-4"
            style={{ boxShadow: "0 24px 60px rgba(20,16,50,.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-ink">
                Add to Home Screen
              </h2>
              <button
                onClick={dismiss}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition active:scale-95"
                style={{ background: "rgba(30,20,80,.06)" }}
              >
                <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* small video window */}
            <div
              className="mx-auto w-[180px] overflow-hidden rounded-[16px] bg-black"
              style={{ boxShadow: "0 8px 22px rgba(20,16,50,.28)" }}
            >
              <video
                key={copy.src}
                className="block w-full"
                src={copy.src}
                autoPlay
                muted
                loop
                playsInline
                controls={false}
              />
            </div>

            {/* numbered steps */}
            <ol className="mt-4 flex flex-col gap-2">
              {copy.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: "var(--brand-grad-v)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-medium text-ink">{s}</span>
                </li>
              ))}
            </ol>

            <button
              onClick={dismiss}
              className="mt-4 w-full rounded-[14px] py-3 text-[15px] font-semibold text-white transition active:scale-[0.98]"
              style={{ background: "var(--brand-grad-v)" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
