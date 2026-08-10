"use client";

import { useRouter } from "next/navigation";
import { PricingTable } from "@clerk/nextjs";
import { PhoneFrame } from "@/components/PhoneFrame";
import { ArrowLeftIcon, CheckIcon, SparkleIcon } from "@/components/icons";
import { useIsPro } from "@/lib/useIsPro";

/**
 * Ordered by what actually sells Pro, not by what was easiest to build.
 *
 * The free reminder loop only runs while a ClassPing tab is open (see the
 * 30s interval in lib/store.tsx) — so on a locked phone, free delivers
 * nothing. Every server-side channel is Pro. That gap is the product, and it
 * used to go unmentioned on this screen while "Unlimited classes" led.
 */
const PERKS = [
  "Reminders that reach you with the app closed",
  "Email before class, so you actually leave on time",
  "An end-of-day email of what's still open",
  "A nudge after class to log what was assigned",
  "Unlimited classes + cloud sync across devices",
  "Grades & GPA, calendar export, premium themes",
];

export default function UpgradeScreen() {
  const router = useRouter();
  const { isPro } = useIsPro();

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* nav */}
        <div className="flex items-center px-5 pb-2.5 pt-[60px]">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink"
            style={{ boxShadow: "0 1px 4px rgba(30,20,80,.08)" }}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center text-[17px] font-semibold text-ink">
            ClassPing Pro
          </div>
          <div className="w-9" />
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-10 pt-2">
          {/* hero */}
          <div
            className="rounded-[24px] px-5 py-6 text-white"
            style={{
              background: "var(--brand-grad)",
              boxShadow: "0 6px 20px rgba(var(--brand-rgb),.35)",
            }}
          >
            <div className="flex items-center gap-2">
              <SparkleIcon className="h-6 w-6 text-[#FFD76E]" />
              <span className="font-[family-name:var(--font-fredoka)] text-[22px] font-semibold">
                {isPro ? "You're on Pro 🎉" : "Go Pro"}
              </span>
            </div>
            <p className="mt-1.5 text-[14px] leading-snug text-white/85">
              {isPro
                ? "Thanks for supporting ClassPing. Manage your plan below."
                : "Free reminds you while the app is open. Pro reaches you when it isn't."}
            </p>

            <ul className="mt-4 flex flex-col gap-2.5">
              {PERKS.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-[14px]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <CheckIcon className="h-3 w-3 text-white" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* How a reminder actually reaches you — the real free/Pro line.
              Stated plainly rather than sold: free genuinely cannot deliver
              anything while the app is closed, and pretending otherwise would
              just produce refunds. */}
          {!isPro && (
            <div
              className="mt-4 overflow-hidden rounded-[20px] bg-white"
              style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
            >
              <div className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-widest text-faint">
                How reminders reach you
              </div>
              <div className="flex gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-muted">Free</div>
                  <p className="mt-1 text-[13px] leading-snug text-muted-2">
                    Only while ClassPing is open on screen. A locked phone gets
                    nothing.
                  </p>
                </div>
                <div className="w-px shrink-0" style={{ background: "var(--bg-input)" }} />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-brand">Pro</div>
                  <p className="mt-1 text-[13px] leading-snug text-muted-2">
                    Push and email sent from our servers — they arrive with the
                    app closed, on every device.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Clerk-hosted plans + checkout */}
          <div className="mt-5">
            <PricingTable />
          </div>

          <p className="mt-4 text-center text-[12px] text-hint">
            Cancel anytime. Your classes and tasks always stay yours.
          </p>
        </div>
      </div>
    </PhoneFrame>
  );
}
