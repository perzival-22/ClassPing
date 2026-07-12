"use client";

import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { ChatIcon } from "@/components/icons";
import { justEndedClass, useNow, useStore } from "@/lib/store";

/**
 * Post-class prompt — shown right after a class ends, asking whether it came
 * with an assignment. "Yes" jumps straight into Add Assignment, pre-filled with
 * the class that actually just finished (see `justEndedClass`).
 */
export default function PostClassPromptScreen() {
  const router = useRouter();
  const { classes, hydrated } = useStore();
  const now = useNow();

  // `now` is null on the server-rendered first paint, so hold the frame until
  // both the clock and persisted state are live.
  if (!now || !hydrated) {
    return (
      <PhoneFrame>
        <div className="h-full bg-aurora" />
      </PhoneFrame>
    );
  }

  const justEnded = justEndedClass(classes, now);

  // Nothing ended in the last half hour — there's nothing to ask about.
  if (!justEnded) return <NothingJustEnded onDismiss={() => router.push("/home")} />;

  return (
    <PhoneFrame>
      <div className="relative flex h-full flex-col bg-aurora">
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
          className="no-scrollbar absolute left-6 right-6 top-1/2 max-h-[82%] -translate-y-1/2 overflow-y-auto rounded-[28px] bg-white px-6 pb-[22px] pt-7 text-center"
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

/**
 * Reached when no class ended recently — someone opened /prompt directly, or
 * lingered past the window. Previously this rendered nothing at all (a blank
 * white screen), so say something useful and offer a way out.
 */
function NothingJustEnded({ onDismiss }: { onDismiss: () => void }) {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col items-center justify-center bg-aurora px-8 text-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[24px] bg-[#FFE8E3] text-poli">
          <ChatIcon className="h-9 w-9" />
        </div>
        <h2 className="mt-5 font-[family-name:var(--font-fredoka)] text-[22px] font-semibold text-ink">
          No class just ended
        </h2>
        <p className="mt-2 text-[14px] leading-snug text-muted">
          This nudge shows up right after one of your classes finishes, so you
          can log an assignment while it&apos;s still fresh.
        </p>
        <button
          onClick={onDismiss}
          className="btn-brand mt-6 w-full rounded-[17px] py-[15px] text-[16px] font-semibold text-white transition active:scale-[0.98]"
        >
          Back to Home
        </button>
      </div>
    </PhoneFrame>
  );
}
