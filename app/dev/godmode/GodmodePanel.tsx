"use client";

import { useState } from "react";
import {
  buildGodmodeDocument,
  GODMODE_STORAGE_KEY,
} from "@/lib/godmode";

/**
 * Two buttons: fill the planner with a simulated year, or empty it again.
 *
 * Both write localStorage directly and then hard-reload, rather than going
 * through the store's own setters. The store reads its document once on mount
 * and writes it back on every change — so seeding through the live provider
 * would race its own persist effect, and half the seed would be overwritten by
 * whatever was already in memory. Writing the key and reloading means the store
 * hydrates from the seed exactly as it would from a real returning session.
 */
export function GodmodePanel() {
  const [busy, setBusy] = useState(false);

  const apply = (write: () => void) => {
    setBusy(true);
    write();
    // A full document load, not router.push. The lint rule is right about
    // ordinary navigation and wrong here: the store hydrates from localStorage
    // once, on mount, and a client-side push keeps the provider mounted — so
    // the pre-seed document would stay in memory and its persist effect would
    // write it straight back over the seed. Reloading is the point.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/home";
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[520px] flex-col justify-center gap-5 px-6 py-16">
      <div>
        <h1 className="font-[family-name:var(--font-fredoka)] text-[28px] font-semibold leading-tight text-ink">
          Godmode
        </h1>
        <p className="mt-2 text-[14px] leading-snug text-muted">
          Replaces your planner with a simulated academic year: five classes, a
          term of assignments and grades, thirty-five lecture notes, a full
          trophy cabinet, and level {100} with all twenty-seven pets collected.
        </p>
        <p className="mt-2 text-[13px] leading-snug text-faint">
          This overwrites whatever is in local storage on this device. It does
          not touch the server until the app next syncs — which it will, so
          don&apos;t run it signed in as an account whose real data you want.
        </p>
      </div>

      <button
        disabled={busy}
        onClick={() =>
          apply(() => {
            const doc = buildGodmodeDocument();
            localStorage.setItem(GODMODE_STORAGE_KEY, JSON.stringify(doc));
          })
        }
        className="btn-brand w-full rounded-[15px] py-[15px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Seeding…" : "Fill with a simulated year"}
      </button>

      <button
        disabled={busy}
        onClick={() => apply(() => localStorage.removeItem(GODMODE_STORAGE_KEY))}
        className="w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: "var(--brand-soft)" }}
      >
        Empty the planner
      </button>
    </main>
  );
}
