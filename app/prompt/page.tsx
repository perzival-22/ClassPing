"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { ChatIcon } from "@/components/icons";
import {
  fmtTime,
  justEndedClass,
  useNow,
  useStore,
  type ClassItem,
  type DayIndex,
} from "@/lib/store";

/**
 * Post-class prompt — shown right after a class ends, asking whether it came
 * with an assignment. "Yes" jumps straight into Add Assignment, pre-filled with
 * the class that actually just finished.
 *
 * Two ways in:
 *   • The push notification (/api/cron/post-class), which passes ?class=<id>.
 *     On iOS this is the *only* way the question gets asked, because Safari
 *     won't render the notification's Yes/No buttons.
 *   • Opening it with no param, in which case we infer the class from the clock.
 */
function PostClassPrompt() {
  const router = useRouter();
  const params = useSearchParams();
  const { classes, classById, hydrated } = useStore();
  const now = useNow();
  const [dismissed, setDismissed] = useState(false);

  // `now` is null on the server-rendered first paint, so hold the frame until
  // both the clock and persisted state are live.
  if (!now || !hydrated) {
    return (
      <PhoneFrame>
        <div className="h-full bg-aurora" />
      </PhoneFrame>
    );
  }

  // Prefer the class the notification named. It's authoritative — the push was
  // sent the moment that class ended — and it keeps working if the student only
  // gets round to tapping the notification an hour later, by which point the
  // clock-based guess below would have given up.
  const fromParam = params.get("class");
  const justEnded =
    (fromParam ? classById(fromParam) : undefined) ??
    justEndedClass(classes, now);

  // Nothing ended recently — there's nothing to ask about.
  if (!justEnded) {
    return <NothingJustEnded onDismiss={() => router.push("/home")} />;
  }

  if (dismissed) {
    return (
      <SignedOff
        next={nextClassToday(classes, now)}
        onDone={() => router.push("/home")}
      />
    );
  }

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
              onClick={() => setDismissed(true)}
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
 * The "No" answer. Previously this just bounced to /week, which read as the tap
 * having missed — say something, and point at whatever's next so the screen is
 * doing a small job rather than just closing.
 */
function SignedOff({
  next,
  onDone,
}: {
  next: ClassItem | null;
  onDone: () => void;
}) {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col items-center justify-center bg-aurora px-8 text-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[24px] bg-[#E6F7EE] text-[34px]">
          🎉
        </div>
        <h2 className="mt-5 font-[family-name:var(--font-fredoka)] text-[22px] font-semibold text-ink">
          Nice — nothing to log
        </h2>
        <p className="mt-2 text-[14px] leading-snug text-muted">
          {next
            ? `Enjoy ${next.name} at ${fmtTime(next.start)} 👋`
            : "That's you done. Have a great rest of your day 👋"}
        </p>
        <button
          onClick={onDone}
          className="btn-brand mt-6 w-full rounded-[17px] py-[15px] text-[16px] font-semibold text-white transition active:scale-[0.98]"
        >
          Back to Home
        </button>
      </div>
    </PhoneFrame>
  );
}

/**
 * Reached when no class ended recently — someone opened /prompt directly, or
 * lingered past the window.
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

/** The next class still ahead of `now` today, if any. Mirrors the cron's pick. */
function nextClassToday(classes: ClassItem[], now: Date): ClassItem | null {
  const dow = (now.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  if (dow > 4) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  return (
    classes
      .filter((c) => c.days.includes(dow as DayIndex) && c.start > mins)
      .sort((a, b) => a.start - b.start)[0] ?? null
  );
}

export default function PostClassPromptScreen() {
  return (
    <Suspense fallback={null}>
      <PostClassPrompt />
    </Suspense>
  );
}
