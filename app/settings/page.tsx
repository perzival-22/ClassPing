"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { Toggle } from "@/components/Toggle";
import { ImportCalendar } from "@/components/ImportCalendar";
import { SettingsSkeleton } from "@/components/Skeleton";
import {
  BellIcon,
  CalendarIcon,
  CameraIcon,
  ChevronRightIcon,
  LockIcon,
  LogOutIcon,
  SparkleIcon,
} from "@/components/icons";
import {
  accentsIn,
  isProAccent,
  type Accent,
  type AccentId,
} from "@/lib/accents";
import { useStore } from "@/lib/store";
import { termProgress } from "@/lib/time";
import { downloadCalendarFile } from "@/lib/calendar";
import {
  isPushSubscribed,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/notifications";
import {
  avatarErrorMessage,
  fileToAvatarDataUrl,
  isPersistableAvatar,
  uploadAvatar,
} from "@/lib/avatar";
import { useIsPro } from "@/lib/useIsPro";
import { AvatarFrame } from "@/components/Level";
import { levelFromXp } from "@/lib/xp";
import { tierFor } from "@/lib/pet";

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
  // activeClasses for anything describing "now" — an archived term shouldn't
  // be exported to the phone calendar or counted in the export summary. The
  // full `classes`/`grades` sets are used only for the account-data export.
  const {
    profile,
    setProfile,
    activeClasses: classes,
    classes: allClasses,
    grades,
    archiveTerm,
    tasks,
    trophies,
    xp,
    clearData,
  } = useStore();
  const { isPro } = useIsPro();
  const [termName, setTermName] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archived, setArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleExportData() {
    // The whole document — including archived classes — straight from the
    // store. No server round-trip: localStorage is the source of truth.
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "ClassPing",
      classes: allClasses,
      tasks,
      grades,
      profile,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "classping-data.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function handleDeleteAccount() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(
          data.dataDeleted
            ? "Your data was removed, but the account itself couldn't be deleted. Please try again."
            : "Couldn't delete your account. Please try again.",
        );
        setDeleting(false);
        return;
      }
      // The Clerk user is gone, so the session is dead — clear the local copy
      // and leave, wiping the SW page cache too, as on sign-out.
      try {
        localStorage.clear();
      } catch {
        /* private mode */
      }
      navigator.serviceWorker?.controller?.postMessage({ type: "signout" });
      // A hard navigation on purpose: the Clerk user no longer exists, so we
      // want a full reload that tears down all in-memory auth state, not a
      // soft SPA transition that keeps the dead session's providers mounted.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch {
      setDeleteError("Couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  }

  const [username, setUsername] = useState(profile.username);
  // Profiles saved before avatars were stored as data URIs hold a dead `blob:`
  // URL — drop it and fall back to initials rather than render a broken image.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    isPersistableAvatar(profile.avatarUrl) ? profile.avatarUrl : null,
  );
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── post-class push ──
     `null` while we're still asking the browser whether this device already has
     a subscription, so the switch doesn't flick from off to on after mount. */
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const canPush = pushSupported();

  useEffect(() => {
    if (!canPush) {
      // Push support is a browser capability, unknowable until after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPushOn(false);
      return;
    }
    isPushSubscribed().then(setPushOn);
  }, [canPush]);

  /* ── email preferences ──
     Server-held (the crons read them), not part of the synced document: an
     opt-out has to take effect even if this device never syncs again. `null`
     until loaded so the switches don't flick after mount. */
  const [emailPrefs, setEmailPrefs] = useState<{
    preClass: boolean;
    postClass: boolean;
    dailyDigest: boolean;
    weekly: boolean;
    unsubscribedAll: boolean;
  } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/email/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d) setEmailPrefs(d);
      })
      .catch(() => {
        /* offline — leave the card in its loading state */
      });
    return () => {
      live = false;
    };
  }, []);

  function handleEmailPref(
    key: "preClass" | "postClass" | "dailyDigest" | "weekly",
  ) {
    return (next: boolean) => {
      if (!emailPrefs) return;
      // Optimistic: the switch answers immediately and the write follows.
      // Turning any stream on also clears the master unsubscribe, otherwise
      // the toggle would read on and still deliver nothing.
      const clearOptout = next && emailPrefs.unsubscribedAll;
      const optimistic = {
        ...emailPrefs,
        [key]: next,
        unsubscribedAll: clearOptout ? false : emailPrefs.unsubscribedAll,
      };
      setEmailPrefs(optimistic);
      fetch("/api/email/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [key]: next,
          ...(clearOptout ? { unsubscribedAll: false } : {}),
        }),
      }).catch(() => {
        /* offline — revert so the switch never lies about server state */
        setEmailPrefs(emailPrefs);
      });
    };
  }

  const openTasks = tasks.filter((t) => !t.done);
  const hasSchedule = classes.length > 0 || openTasks.length > 0;

  /**
   * What "clear my data" would actually destroy, spelled out: "6 classes, 23
   * assignments and 14 grades". A confirmation that names the damage is worth
   * far more than one that warns in the abstract, and it's the only way the
   * user can tell at a glance whether they're about to lose a whole semester
   * or the two things they added this morning. Archived classes are counted
   * too — they're invisible on the timetable but they're still data.
   */
  const clearable = [
    { n: allClasses.length, one: "class", many: "classes" },
    { n: tasks.length, one: "assignment", many: "assignments" },
    { n: grades.length, one: "grade", many: "grades" },
    { n: trophies.trophies.length, one: "trophy", many: "trophies" },
  ].filter((p) => p.n > 0);

  const hasAnyData = clearable.length > 0;
  const clearSummary =
    clearable.length === 0
      ? "everything"
      : clearable
          .map((p) => `${p.n} ${p.n === 1 ? p.one : p.many}`)
          .reduce((acc, part, i, all) =>
            i === all.length - 1 ? `${acc} and ${part}` : `${acc}, ${part}`,
          );

  async function handlePushToggle(next: boolean) {
    if (!isPro) {
      router.push("/upgrade");
      return;
    }
    setPushBusy(true);
    setPushError(null);
    try {
      if (next) {
        const ok = await subscribeToPush();
        setPushOn(ok);
        if (!ok) {
          // The overwhelmingly common cause is a denied permission prompt, and
          // once denied the browser won't ask again — the user has to clear it
          // in site settings, so saying "try again" would be a lie.
          setPushError(
            typeof Notification !== "undefined" &&
              Notification.permission === "denied"
              ? "Notifications are blocked for ClassPing. Enable them in your browser's site settings, then try again."
              : "Couldn't turn on notifications. Check your connection and try again.",
          );
        }
      } else {
        await unsubscribeFromPush();
        setPushOn(false);
      }
    } finally {
      setPushBusy(false);
    }
  }

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
        // The semester bounds go with it, so the export covers this term
        // and stops — not every Tuesday from now until the heat death.
        body: JSON.stringify({
          classes,
          tasks,
          now,
          term: { start: profile.termStart, end: profile.termEnd },
        }),
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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires a change.
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    try {
      // Encoded to a data URI, not an object URL: the profile is serialized to
      // localStorage and synced to Postgres, and a `blob:` URL dies with the page.
      setAvatarUrl(await fileToAvatarDataUrl(file));
    } catch (err) {
      setAvatarError(avatarErrorMessage(err));
    }
  }

  async function handleSave() {
    // Upload a freshly-picked avatar to Blob on save (not on pick, so a
    // cancelled change never creates a blob), and store the returned URL so a
    // Pro sync carries ~90 bytes instead of ~180KB. Falls back to the data URI
    // untouched when Blob isn't configured — see uploadAvatar.
    let avatarToSave = avatarUrl;
    if (avatarUrl && avatarUrl.startsWith("data:image/")) {
      setSavingAvatar(true);
      avatarToSave = await uploadAvatar(avatarUrl);
      setAvatarUrl(avatarToSave);
      setSavingAvatar(false);
    }
    setProfile({
      username: username.trim() || profile.username,
      avatarUrl: avatarToSave,
    });
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
                {/* The frame is an XP unlock, so it's gated on the level here
                    rather than on the stored id alone — a document edited to
                    name a ring the user hasn't earned simply doesn't get one. */}
                <AvatarFrame
                  tier={tierFor(levelFromXp(xp.xp))}
                  size={90}
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
                </AvatarFrame>
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
              {avatarError ? (
                <p className="text-[13px] font-medium text-[var(--danger)]">
                  {avatarError}
                </p>
              ) : (
                <p className="text-[13px] text-muted">Tap to change photo</p>
              )}
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
              disabled={savingAvatar}
              className="btn-brand mt-4 w-full rounded-[15px] py-[14px] text-center text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {savingAvatar ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
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

            <p className="mt-2.5 text-[12px] leading-snug text-faint">
              {profile.theme === "dark"
                ? "Pure black — easy on the eyes at 1am, and easy on an OLED battery."
                : "Dark mode goes fully black, keeping your app color."}
            </p>

            {/* app accent color (Pro except Classic) */}
            <div className="mb-3 mt-5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              App color
              {!isPro && <ProTag />}
            </div>
            <AccentRow
              accents={accentsIn("core")}
              isPro={isPro}
              current={profile.accent ?? "classic"}
              onPick={(id) => setProfile({ accent: id })}
              onLocked={() => router.push("/upgrade")}
            />

            {/* The vibrant set — Pro-only, and shelved apart so it reads as
                something extra rather than five more dots in the same row. */}
            <div className="mb-3 mt-5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Vibrant
              <ProTag />
            </div>
            <AccentRow
              accents={accentsIn("vibrant")}
              isPro={isPro}
              current={profile.accent ?? "classic"}
              onPick={(id) => setProfile({ accent: id })}
              onLocked={() => router.push("/upgrade")}
            />
            {!isPro && (
              <p className="mt-3 text-[12px] leading-snug text-faint">
                Five louder themes that re-skin the whole app. Unlocked with Pro.
              </p>
            )}
          </div>

          {/* ── Reminders card ── */}
          <div
            className="mt-4 rounded-[24px] bg-white px-5 py-5"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Reminders
            </div>

            {/* post-class nudge — delivered by the server, so it arrives with
                the app closed. */}
            <div className="flex items-start gap-3">
              <div
                className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: "var(--brand-soft)" }}
              >
                <BellIcon className="h-[18px] w-[18px] text-brand" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-medium text-ink">
                    After-class nudge
                  </span>
                  {!isPro && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white"
                      style={{ background: "var(--color-brand)" }}
                    >
                      PRO
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">
                  When a class ends, we&apos;ll ask if it came with an
                  assignment — even if ClassPing is closed.
                </p>
              </div>
              <Toggle
                on={pushOn === true}
                onChange={(v) => {
                  if (!pushBusy && canPush) handlePushToggle(v);
                }}
              />
            </div>

            <p className="mt-2.5 text-[12px] leading-snug text-faint">
              {!canPush
                ? // iOS only exposes PushManager to an installed PWA, so in a
                  // plain Safari tab the toggle above genuinely cannot work.
                  "Install ClassPing to your home screen to turn this on."
                : pushBusy
                  ? "Just a sec…"
                  : pushError
                    ? pushError
                    : pushOn
                      ? "On for this device. Turn it on again on any other phone or laptop you use."
                      : "Off — you'll only be reminded while the app is open."}
            </p>

            <div className="my-5 h-px" style={{ background: "var(--bg-input)" }} />

            {/* email streams — each one separately switchable, so turning off
                pre-class mail doesn't also kill the end-of-day digest. */}
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Email
              {!isPro && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white"
                  style={{ background: "var(--color-brand)" }}
                >
                  PRO
                </span>
              )}
            </div>

            {emailPrefs === null ? (
              <p className="text-[13px] text-faint">Loading your email settings…</p>
            ) : (
              <>
                <EmailPrefRow
                  label="Before class"
                  hint="A heads-up email before each class starts."
                  on={emailPrefs.preClass && !emailPrefs.unsubscribedAll}
                  onChange={handleEmailPref("preClass")}
                />
                <EmailPrefRow
                  label="After class"
                  hint="A prompt to log anything the class assigned."
                  on={emailPrefs.postClass && !emailPrefs.unsubscribedAll}
                  onChange={handleEmailPref("postClass")}
                />
                <EmailPrefRow
                  label="End-of-day digest"
                  hint="What's still open, once the school day is done."
                  on={emailPrefs.dailyDigest && !emailPrefs.unsubscribedAll}
                  onChange={handleEmailPref("dailyDigest")}
                />
                <EmailPrefRow
                  label="Week ahead"
                  hint="Sunday evening: your classes and what's due this week."
                  on={emailPrefs.weekly && !emailPrefs.unsubscribedAll}
                  onChange={handleEmailPref("weekly")}
                  last
                />
                {emailPrefs.unsubscribedAll && (
                  <p className="mt-2.5 text-[12px] leading-snug text-faint">
                    You unsubscribed from all ClassPing email. Turn any switch
                    back on to start receiving it again.
                  </p>
                )}
              </>
            )}

            <div className="my-5 h-px" style={{ background: "var(--bg-input)" }} />

            <div className="flex items-start gap-3">
              <div
                className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: "var(--brand-soft)" }}
              >
                <CalendarIcon className="h-[18px] w-[18px] text-brand" />
              </div>
              <p className="text-[13px] leading-snug text-muted">
                Prefer your own calendar? Add your schedule to it and your phone
                will deliver the class reminders too.
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

          {/* ── Import from an LMS ── */}
          {isPro ? (
            <ImportCalendar />
          ) : (
            <button
              onClick={() => router.push("/upgrade")}
              className="mt-4 w-full rounded-[24px] bg-white px-5 py-5 text-left"
              style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
                Import from your school
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white"
                  style={{ background: "var(--color-brand)" }}
                >
                  PRO
                </span>
              </div>
              <p className="text-[13px] leading-snug text-muted">
                Pull your whole timetable and every deadline straight from
                Canvas, Blackboard, Moodle or Google Classroom — no typing.
              </p>
            </button>
          )}

          {/* ── Grading card ──
              The A/A-/B+ bands are a US convention, not a universal one. */}
          <div
            className="mt-4 rounded-[24px] bg-white px-5 py-5"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Grading scale
            </div>
            <div
              className="flex w-full rounded-[14px] p-1"
              style={{ background: "var(--bg-input)" }}
            >
              {(
                [
                  { id: "standard", label: "A / A− / B+" },
                  { id: "simple", label: "A / B / C" },
                ] as const
              ).map((s) => {
                const active = (profile.gradeScale ?? "standard") === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setProfile({ gradeScale: s.id })}
                    className="flex flex-1 items-center justify-center rounded-[11px] py-[11px] text-[15px] transition"
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
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-[12px] leading-snug text-faint">
              {(profile.gradeScale ?? "standard") === "standard"
                ? "93+ is an A, 90+ an A−. The usual US scale."
                : "90+ is an A, 80+ a B. No plus or minus bands."}
            </p>
          </div>

          {/* ── Semester card ──
              Without this a class added in September is still on the timetable
              the following June, and the GPA blends every course ever taken.
              The dates bound the schedule; archiving clears it and keeps the
              grades. Shown even with no classes yet, because setting the term
              up front is exactly when it's least annoying to do. */}
          <div
            className="mt-4 rounded-[24px] bg-white px-5 py-5"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Semester
            </div>

            {/* Keyed on the stored name so an external reset — clearing your
                data, or archiving the term — remounts this and reseeds its
                draft. Without it the input keeps displaying the old term after
                the profile has dropped it, and the next blur writes the stale
                value back. Typing doesn't churn the key: the draft is local
                until blur, which is the only thing that changes termName. */}
            <CurrentTerm key={profile.termName ?? ""} />

            {classes.length > 0 && (
              <>
              <div className="my-5 h-px" style={{ background: "var(--bg-input)" }} />

              <p className="text-[13px] leading-snug text-muted">
                Finished the semester? Archive these {classes.length}{" "}
                {classes.length === 1 ? "class" : "classes"} to clear your
                timetable. Their grades stay on the Grades screen under the
                term name.
              </p>

              {archiving ? (
                <>
                  <label
                    className="mt-3 block rounded-[15px] px-4 py-[13px]"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid rgba(var(--brand-rgb),.12)",
                    }}
                  >
                    <div className="text-[11px] font-semibold tracking-wide text-faint">
                      NAME THIS TERM
                    </div>
                    <input
                      value={termName}
                      onChange={(e) => setTermName(e.target.value)}
                      placeholder="e.g. Fall 2025"
                      className="mt-[3px] w-full bg-transparent text-[16px] text-ink outline-none"
                    />
                  </label>
                  <div className="mt-3 flex gap-2.5">
                    <button
                      onClick={() => {
                        setArchiving(false);
                        setTermName("");
                      }}
                      className="flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-muted"
                      style={{ background: "var(--bg-input)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        archiveTerm(termName);
                        // The dates and name described the term just archived,
                        // so clear them rather than let the next semester
                        // inherit last semester's calendar.
                        setProfile({
                          termName: undefined,
                          termStart: null,
                          termEnd: null,
                        });
                        setArchiving(false);
                        setTermName("");
                        setArchived(true);
                        setTimeout(() => setArchived(false), 4000);
                      }}
                      disabled={termName.trim().length === 0}
                      className="btn-brand flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                    >
                      Archive
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => {
                    setTermName(profile.termName ?? "");
                    setArchiving(true);
                  }}
                  className="mt-3 w-full rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-brand transition active:scale-[0.98]"
                  style={{ background: "var(--brand-soft)" }}
                >
                  Start a new term
                </button>
              )}
              </>
            )}
          </div>

          {archived && (
            <p className="mt-3 text-center text-[13px] font-medium text-brand">
              Term archived — your timetable is clear. 🎉
            </p>
          )}

          {/* ── Account card ── */}
          <div
            className="mt-4 rounded-[24px] bg-white"
            style={{ boxShadow: "0 2px 12px rgba(30,20,80,.07)" }}
          >
            <div className="px-5 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-widest text-faint">
              Account
            </div>

            {/* Download my data — a plain JSON copy of everything. */}
            <button
              onClick={handleExportData}
              className="flex w-full items-center gap-3 px-5 py-4 transition active:bg-canvas"
              style={{ borderBottom: "1px solid var(--bg-input)" }}
            >
              <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-[var(--brand-soft)] text-[17px]">
                📁
              </div>
              <span className="flex-1 text-left text-[15px] font-medium text-ink">
                Download my data
              </span>
            </button>

            {/* Clear data — a fresh planner on the same account. Two-tap, and
                the confirmation names exactly what's about to go rather than
                warning in the abstract. */}
            <div style={{ borderBottom: "1px solid var(--bg-input)" }}>
              {confirmClear ? (
                <div className="px-5 py-4">
                  <p className="text-[13px] leading-snug text-muted">
                    This permanently deletes {clearSummary} — on this device and
                    in the cloud. Your account, sign-in and preferences stay.
                    It can&apos;t be undone.
                  </p>
                  <button
                    onClick={handleExportData}
                    className="mt-2 text-[13px] font-semibold text-brand"
                  >
                    Download a copy first
                  </button>
                  <div className="mt-3 flex gap-2.5">
                    <button
                      onClick={() => setConfirmClear(false)}
                      disabled={clearing}
                      className="flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-muted disabled:opacity-50"
                      style={{ background: "var(--bg-input)" }}
                    >
                      Keep it
                    </button>
                    <button
                      onClick={async () => {
                        setClearing(true);
                        // Awaited so the button stays busy until the cloud copy
                        // is gone too, not just the one on this device.
                        await clearData();
                        setClearing(false);
                        setConfirmClear(false);
                        setCleared(true);
                        setTimeout(() => setCleared(false), 5000);
                      }}
                      disabled={clearing}
                      className="flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
                      style={{ background: "var(--danger)" }}
                    >
                      {clearing ? "Clearing…" : "Clear everything"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={!hasAnyData}
                  className="flex w-full items-center gap-3 px-5 py-4 transition active:bg-canvas disabled:opacity-50"
                >
                  <div
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] text-[17px]"
                    style={{ background: "var(--warn-soft)" }}
                  >
                    🧹
                  </div>
                  <span className="flex-1 text-left">
                    <span className="block text-[15px] font-medium text-ink">
                      Clear all data
                    </span>
                    <span className="mt-[1px] block text-[12px] text-muted">
                      {cleared
                        ? "Cleared — your planner is empty."
                        : hasAnyData
                          ? `Erase ${clearSummary}. Keeps your account.`
                          : "Nothing to clear yet."}
                    </span>
                  </span>
                </button>
              )}
            </div>

            <button
              onClick={() =>
                signOut(() => {
                  // Drop this user's cached app shells before the next person
                  // uses the device — see the signout handler in sw.js.
                  navigator.serviceWorker?.controller?.postMessage({
                    type: "signout",
                  });
                  router.push("/");
                })
              }
              className="flex w-full items-center gap-3 px-5 py-4 transition active:bg-canvas"
              style={{ borderBottom: "1px solid var(--bg-input)" }}
            >
              <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-[var(--danger-soft)]">
                <LogOutIcon className="h-[18px] w-[18px] text-[var(--danger)]" />
              </div>
              <span className="flex-1 text-left text-[15px] font-medium text-[var(--danger)]">
                Log out
              </span>
            </button>

            {/* Delete account — irreversible, so two-tap confirm and a plain
                warning about what goes. */}
            <div className="px-5 py-4">
              {confirmDelete ? (
                <div>
                  <p className="text-[13px] leading-snug text-muted">
                    This permanently deletes your account, cloud data and
                    reminders. Your on-device data is cleared too. This can&apos;t
                    be undone — export first if you want a copy.
                  </p>
                  {deleteError && (
                    <p className="mt-2 text-[13px] font-medium text-[var(--danger)]">
                      {deleteError}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2.5">
                    <button
                      onClick={() => {
                        setConfirmDelete(false);
                        setDeleteError(null);
                      }}
                      disabled={deleting}
                      className="flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-muted disabled:opacity-50"
                      style={{ background: "var(--bg-input)" }}
                    >
                      Keep my account
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="flex-1 rounded-[15px] py-[13px] text-center text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
                      style={{ background: "var(--danger)" }}
                    >
                      {deleting ? "Deleting…" : "Delete forever"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleDeleteAccount}
                  className="text-[14px] font-medium text-[var(--danger)]"
                >
                  Delete account
                </button>
              )}
            </div>
          </div>

          {/* app info */}
          <p className="mt-6 text-center text-[12px] text-hint">
            ClassPing v38.1638
          </p>
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}

/**
 * The semester the user is currently in: what it's called and when it runs.
 *
 * Dates commit as they're picked (a date picker is a deliberate, discrete
 * choice) while the name commits on blur, so neither needs its own save
 * button. Two things pay for the entry: the progress read ("week 6 of 16"),
 * and the fact that these dates now bound the schedule everywhere — Today,
 * the week grid and the exported calendar all stop at the end of term instead
 * of repeating your Tuesday 9am into the next decade.
 */
function CurrentTerm() {
  const { profile, setProfile } = useStore();
  const [name, setName] = useState(profile.termName ?? "");

  const start = profile.termStart ?? "";
  const end = profile.termEnd ?? "";
  const progress = termProgress(start, end, new Date());
  // Both dates present but no progress means end < start — say so rather than
  // silently showing nothing after the user has filled the form in.
  const inverted = start !== "" && end !== "" && progress === null;

  return (
    <>
      <label
        className="block rounded-[15px] px-4 py-[13px]"
        style={{
          background: "var(--bg-input)",
          border: "1px solid rgba(var(--brand-rgb),.12)",
        }}
      >
        <div className="text-[11px] font-semibold tracking-wide text-faint">
          CURRENT TERM
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setProfile({ termName: name.trim() || undefined })}
          placeholder="e.g. Fall 2025"
          maxLength={64}
          className="mt-[3px] w-full bg-transparent text-[16px] text-ink outline-none"
        />
      </label>

      <div className="mt-2.5 flex gap-2.5">
        <DateBox
          label="SEMESTER STARTS"
          value={start}
          max={end || undefined}
          onChange={(v) => setProfile({ termStart: v || null })}
        />
        <DateBox
          label="SEMESTER ENDS"
          value={end}
          min={start || undefined}
          onChange={(v) => setProfile({ termEnd: v || null })}
        />
      </div>

      {(start || end) && !inverted && (
        <p className="mt-2.5 text-[12px] leading-snug text-faint">
          Your classes only appear inside this window — on Today, on the week
          grid, and in the calendar you export to your phone.
        </p>
      )}

      {progress ? (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--bg-input)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(progress.fraction * 100)}%`,
                background: "var(--brand-grad)",
              }}
            />
          </div>
          <p className="mt-2 text-[12.5px] leading-snug text-muted">
            {progress.phase === "before"
              ? `Starts in ${progress.totalDays - progress.remainingDays + 1} ${
                  progress.totalDays - progress.remainingDays + 1 === 1
                    ? "day"
                    : "days"
                } — ${progress.totalWeeks} weeks long.`
              : progress.phase === "after"
                ? "This term has ended. Archive it below to clear your timetable."
                : `Week ${progress.week} of ${progress.totalWeeks} · ${progress.remainingDays} ${
                    progress.remainingDays === 1 ? "day" : "days"
                  } to go.`}
          </p>
        </div>
      ) : (
        <p className="mt-2.5 text-[12px] leading-snug text-faint">
          {inverted
            ? "The end date is before the start date — check the dates."
            : "Set both dates to see how far through the semester you are. They're printed on your grade report too."}
        </p>
      )}
    </>
  );
}

function DateBox({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className="flex-1 rounded-[15px] px-4 py-[11px]"
      style={{
        background: "var(--bg-input)",
        border: "1px solid rgba(var(--brand-rgb),.12)",
      }}
    >
      <div className="text-[11px] font-semibold tracking-wide text-faint">
        {label}
      </div>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="mt-[3px] w-full bg-transparent text-[15px] text-ink outline-none"
      />
    </label>
  );
}

/** The little PRO badge that marks a locked section header. */
function ProTag() {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white"
      style={{ background: "var(--color-brand)" }}
    >
      PRO
    </span>
  );
}

/**
 * One shelf of accent swatches. A locked swatch is dimmed, padlocked and
 * routes to the upgrade screen rather than being disabled — a dead button
 * tells the user nothing about why it won't work.
 */
function AccentRow({
  accents,
  isPro,
  current,
  onPick,
  onLocked,
}: {
  accents: Accent[];
  isPro: boolean;
  current: AccentId;
  onPick: (id: AccentId) => void;
  onLocked: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {accents.map((a) => {
        const locked = !isPro && isProAccent(a.id);
        const active = current === a.id;
        return (
          <button
            key={a.id}
            onClick={() => (locked ? onLocked() : onPick(a.id))}
            aria-label={locked ? `${a.label} (Pro)` : a.label}
            aria-pressed={active}
            className="flex flex-col items-center gap-1.5"
          >
            <span
              className="relative block h-9 w-9 rounded-full transition"
              style={{
                background: a.swatch,
                opacity: locked ? 0.45 : 1,
                outline: active ? `2px solid ${a.swatch}` : "none",
                outlineOffset: 2,
              }}
            >
              {locked && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full"
                  style={{
                    background: "var(--bg-card)",
                    boxShadow: "0 1px 3px rgba(30,20,80,.2)",
                  }}
                >
                  <LockIcon className="h-2.5 w-2.5 text-muted-2" />
                </span>
              )}
            </span>
            <span
              className="text-[11px] font-medium"
              style={{
                color: active ? "var(--color-brand)" : "var(--color-muted)",
              }}
            >
              {a.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One switchable email stream inside the Reminders card. */
function EmailPrefRow({
  label,
  hint,
  on,
  onChange,
  last,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-3"
      style={last ? undefined : { marginBottom: 14 }}
    >
      <div className="flex-1">
        <div className="text-[15px] font-medium text-ink">{label}</div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{hint}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}
