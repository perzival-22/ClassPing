"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { SettingsSkeleton } from "@/components/Skeleton";
import {
  CalendarIcon,
  CameraIcon,
  ChevronRightIcon,
  LockIcon,
  LogOutIcon,
  SparkleIcon,
} from "@/components/icons";
import { ACCENTS, isProAccent, type AccentId } from "@/lib/accents";
import { useStore } from "@/lib/store";
import { downloadCalendarFile } from "@/lib/calendar";
import { useIsPro } from "@/lib/useIsPro";

export default function SettingsScreen() {
  const { hydrated } = useStore();

  // The form seeds its state from the profile on mount, so it must not mount
  // until persisted state has loaded.
  if (!hydrated) {
    return <SettingsSkeleton />;
  }

  return <SettingsForm />;
}

function SettingsForm() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { profile, setProfile, classes, tasks } = useStore();
  const { isPro } = useIsPro();

  const [username, setUsername] = useState(profile.username);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [saved, setSaved] = useState(false);
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openTasks = tasks.filter((t) => !t.done);
  const hasSchedule = classes.length > 0 || openTasks.length > 0;

  // Pro feature. The server re-checks the entitlement, so this handler can't
  // be bypassed by editing client state — free users go to the upgrade screen.
  async function handleCalendarExport() {
    if (!isPro) {
      router.push("/upgrade");
      return;
    }
    setExporting(true);
    setExportError(false);
    try {
      // The user's local wall-clock time (naive, no timezone) so the server
      // anchors weekly recurrences to *their* today, not the server's.
      const d = new Date();
      const p = (n: number) => n.toString().padStart(2, "0");
      const now = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classes, tasks, now }),
      });
      if (res.status === 403) {
        router.push("/upgrade");
        return;
      }
      if (!res.ok) throw new Error(`export failed: ${res.status}`);
      downloadCalendarFile(await res.text());
      setExported(true);
      setTimeout(() => setExported(false), 6000);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
  }

  function handleSave() {
    setProfile({ username: username.trim() || profile.username, avatarUrl });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const initials = (username || "?")
    .split(/[.\s_-]/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col bg-aurora">
        {/* header */}
        <div className="flex items-center px-5 pb-3 pt-16">
          <h1 className="font-[family-name:var(--font-fredoka)] text-[28px] font-semibold leading-tight text-ink">
            Settings
          </h1>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-36">
          {/* ── Pro / upgrade card ── */}
          <button
            onClick={() => router.push("/upgrade")}
            className="mb-4 flex w-full items-center gap-3 rounded-[24px] px-5 py-[18px] text-left text-white transition active:scale-[0.99]"
            style={{
              background: "var(--brand-grad)",
              boxShadow: "0 4px 16px rgba(var(--brand-rgb),.3)",
            }}
          >
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white/15">
              <SparkleIcon className="h-5 w-5 text-[#FFD76E]" />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold">
                {isPro ? "ClassPing Pro" : "Upgrade to ClassPing Pro"}
              </div>
              <div className="mt-px text-[12px] text-white/80">
                {isPro
                  ? "You're on Pro — manage your plan"
                  : "Unlimited classes, calendar export & more"}
              </div>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-white/70" />
          </button>

          {/* ── Profile card ── */}
          <div
            className="rounded-[24px] bg-white px-5 py-6"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="mb-5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Profile
            </div>

            {/* avatar */}
            <div className="mb-6 flex flex-col items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="relative"
                aria-label="Change profile picture"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="h-[90px] w-[90px] rounded-full object-cover"
                    style={{ boxShadow: "0 4px 16px rgba(var(--brand-rgb),.25)" }}
                  />
                ) : (
                  <div
                    className="flex h-[90px] w-[90px] items-center justify-center rounded-full text-[28px] font-bold text-white"
                    style={{
                      background: "var(--brand-grad)",
                      boxShadow: "0 4px 16px rgba(var(--brand-rgb),.25)",
                    }}
                  >
                    {initials}
                  </div>
                )}
                <div
                  className="absolute bottom-0 right-0 flex h-[28px] w-[28px] items-center justify-center rounded-full bg-brand text-white"
                  style={{ boxShadow: "0 2px 6px rgba(var(--brand-rgb),.4)" }}
                >
                  <CameraIcon className="h-[14px] w-[14px]" />
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <p className="text-[13px] text-muted">Tap to change photo</p>
            </div>

            {/* username field */}
            <label
              className="block rounded-[15px] px-4 py-[13px]"
              style={{
                background: "var(--bg-input)",
                border: "1px solid rgba(var(--brand-rgb),.12)",
              }}
            >
              <div className="text-[11px] font-semibold tracking-wide text-faint">
                USERNAME
              </div>
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setSaved(false);
                }}
                className="mt-[3px] w-full bg-transparent text-[16px] text-ink outline-none"
                autoComplete="username"
                spellCheck={false}
              />
            </label>

            {/* save button */}
            <button
              onClick={handleSave}
              className="btn-brand mt-4 w-full rounded-[15px] py-[14px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98]"
            >
              {saved ? "Saved ✓" : "Save Changes"}
            </button>
          </div>

          {/* ── Appearance card ── */}
          <div
            className="mt-4 rounded-[24px] bg-white px-5 py-5"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Appearance
            </div>

            <div
              className="flex w-full rounded-[14px] p-1"
              style={{ background: "var(--bg-input)" }}
            >
              {(["light", "dark"] as const).map((t) => {
                const active = profile.theme === t;
                return (
                  <button
                    key={t}
                    onClick={() => setProfile({ theme: t })}
                    className="flex flex-1 items-center justify-center gap-2 rounded-[11px] py-[11px] text-[15px] transition"
                    style={
                      active
                        ? {
                            background: "var(--color-brand)",
                            fontWeight: 600,
                            color: "#fff",
                            boxShadow: "0 2px 8px rgba(var(--brand-rgb),.35)",
                          }
                        : { fontWeight: 500, color: "var(--color-muted)" }
                    }
                  >
                    <span>{t === "light" ? "☀️" : "🌙"}</span>
                    <span>{t === "light" ? "Light" : "Dark"}</span>
                  </button>
                );
              })}
            </div>

            {/* app accent color (Pro except Classic) */}
            <div className="mb-3 mt-5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              App color
              {!isPro && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white"
                  style={{ background: "var(--color-brand)" }}
                >
                  PRO
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {ACCENTS.map((a) => {
                const locked = !isPro && isProAccent(a.id);
                const current = (profile.accent ?? "classic") === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() =>
                      locked
                        ? router.push("/upgrade")
                        : setProfile({ accent: a.id as AccentId })
                    }
                    aria-label={locked ? `${a.label} (Pro)` : a.label}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span
                      className="relative block h-9 w-9 rounded-full transition"
                      style={{
                        background: a.swatch,
                        opacity: locked ? 0.45 : 1,
                        outline: current ? `2px solid ${a.swatch}` : "none",
                        outlineOffset: 2,
                      }}
                    >
                      {locked && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white"
                          style={{ boxShadow: "0 1px 3px rgba(30,20,80,.2)" }}
                        >
                          <LockIcon className="h-2.5 w-2.5 text-[#79749B]" />
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-muted">
                      {a.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Calendar sync card ── */}
          <div
            className="mt-4 rounded-[24px] bg-white px-5 py-5"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Reminders
            </div>

            <div className="flex items-start gap-3">
              <div
                className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: "var(--brand-soft)" }}
              >
                <CalendarIcon className="h-[18px] w-[18px] text-brand" />
              </div>
              <p className="text-[13px] leading-snug text-muted">
                ClassPing can only remind you while it&apos;s open. Add your
                schedule to your phone&apos;s calendar and it will deliver the
                reminders — even when the app is closed.
              </p>
            </div>

            <button
              onClick={handleCalendarExport}
              disabled={!hasSchedule || exporting}
              className="btn-brand mt-4 flex w-full items-center justify-center gap-2 rounded-[15px] py-[14px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Add to phone calendar"}
              {!isPro && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tracking-wide">
                  PRO
                </span>
              )}
            </button>

            <p className="mt-2.5 text-center text-[12px] text-faint">
              {!hasSchedule
                ? "Add a class or task first."
                : !isPro
                  ? "Calendar export is a Pro feature — tap to see plans."
                  : exportError
                    ? "Export didn't work — check your connection and try again."
                    : exported
                      ? "Downloaded classping.ics — open it to finish importing."
                      : `Exports ${classes.length} ${classes.length === 1 ? "class" : "classes"} and ${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"}. Re-add after you change your schedule.`}
            </p>
          </div>

          {/* ── Account card ── */}
          <div
            className="mt-4 rounded-[24px] bg-white"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="px-5 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Account
            </div>

            <button
              onClick={() => signOut(() => router.push("/"))}
              className="flex w-full items-center gap-3 px-5 py-4 transition active:bg-canvas"
            >
              <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-[#FEECEB]">
                <LogOutIcon className="h-[18px] w-[18px] text-[#E84040]" />
              </div>
              <span className="flex-1 text-left text-[15px] font-medium text-[#E84040]">
                Log out
              </span>
            </button>
          </div>

          {/* app info */}
          <p className="mt-6 text-center text-[12px] text-hint">
            ClassPing v35.00
          </p>
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}
