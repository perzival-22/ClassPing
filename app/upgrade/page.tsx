"use client";

import { useRouter } from "next/navigation";
import { PricingTable } from "@clerk/nextjs";
import { PhoneFrame } from "@/components/PhoneFrame";
import { ArrowLeftIcon, CheckIcon, SparkleIcon } from "@/components/icons";
import { useIsPro } from "@/lib/useIsPro";

const PERKS = [
  "Unlimited classes",
  "Export to your phone's calendar (.ics)",
  "4 extra premium colors",
  "Support an indie student app",
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
              background: "linear-gradient(145deg,#6c63ff,#5045d8)",
              boxShadow: "0 6px 20px rgba(91,84,232,.35)",
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
                : "Your full schedule, unlocked — no limits, made for students."}
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
