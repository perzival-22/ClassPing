"use client";

import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { ChatIcon } from "@/components/icons";
import { useStore } from "@/lib/store";

/**
 * Post-class prompt — shown right after a class ends, asking whether it came
 * with an assignment. "Yes" jumps straight into Add Assignment pre-filled with
 * the class that just finished (Modern Political Theory in the mockups).
 */
export default function PostClassPromptScreen() {
  const router = useRouter();
  const { classes } = useStore();
  const justEnded =
    classes.find((c) => c.name === "Modern Political Theory") ?? classes[0];

  return (
    <PhoneFrame>
      <div className="relative flex h-full flex-col bg-canvas">
        {/* dimmed agenda behind */}
        <div className="px-5 pt-16 opacity-50 blur-[2px]">
          <div className="font-[family-name:var(--font-fredoka)] text-[32px] font-semibold text-ink">
            Today
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {["#E39A0E", "#5B54E8", "#EE5137"].map((c) => (
              <div
                key={c}
                className="h-[70px] rounded-2xl bg-white p-4"
                style={{ borderLeft: `4px solid ${c}` }}
              />
            ))}
          </div>
        </div>

        {/* scrim */}
        <div
          className="absolute inset-0"
          style={{
            background: "rgba(30,22,60,.42)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        />

        {/* modal */}
        <div
          className="absolute left-6 right-6 top-1/2 -translate-y-1/2 rounded-[28px] bg-white px-6 pb-[22px] pt-7 text-center"
          style={{ boxShadow: "0 30px 60px rgba(20,12,50,.35)" }}
        >
          <div className="mx-auto flex h-[66px] w-[66px] items-center justify-center rounded-[20px] bg-[#FFE8E3] text-poli">
            <ChatIcon className="h-[34px] w-[34px]" />
          </div>
          <div className="mt-4 text-[13px] font-semibold tracking-wide text-poli">
            {justEnded.name.toUpperCase()} JUST ENDED
          </div>
          <div className="mt-2 font-[family-name:var(--font-fredoka)] text-[24px] font-semibold leading-tight text-ink">
            Did this class come with an assignment?
          </div>
          <div className="mt-2 text-[14px] leading-snug text-[#7A759C]">
            Log it now while it&apos;s fresh — we&apos;ll keep you on track.
          </div>
          <div className="mt-[22px] flex flex-col gap-2.5">
            <button
              onClick={() =>
                router.push(`/tasks/new?class=${encodeURIComponent(justEnded.id)}`)
              }
              className="btn-brand w-full rounded-[15px] py-4 text-[16px] font-semibold text-white transition active:scale-[0.98]"
            >
              Yes, add it
            </button>
            <button
              onClick={() => router.push("/week")}
              className="w-full rounded-[15px] bg-[#F0EFF6] py-4 text-[16px] font-semibold text-[#5A5578] transition active:scale-[0.98]"
            >
              No, I&apos;m good
            </button>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
