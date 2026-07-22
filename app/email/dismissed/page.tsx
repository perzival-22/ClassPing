import Link from "next/link";
import { PhoneFrame } from "@/components/PhoneFrame";

/**
 * Where the digest email's "No, I'm good" button lands.
 *
 * An email can't dismiss itself, so "no" has to go *somewhere* — this page is
 * the smallest possible somewhere: acknowledge the answer, offer the app.
 * Mirrors the SignedOff screen in /prompt, minus the schedule-aware sign-off
 * (this renders on the server, where the visitor's local store doesn't exist).
 */
export default function EmailDismissedScreen() {
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
          That&apos;s today wrapped. You can close this tab, or jump back in.
        </p>
        <Link
          href="/home"
          className="btn-brand mt-6 w-full rounded-[17px] py-[15px] text-[16px] font-semibold text-white transition active:scale-[0.98]"
        >
          Open ClassPing
        </Link>
      </div>
    </PhoneFrame>
  );
}
