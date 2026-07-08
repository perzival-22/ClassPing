"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { TabBar } from "@/components/TabBar";
import { CameraIcon, LogOutIcon } from "@/components/icons";
import { useStore } from "@/lib/store";

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, setProfile } = useStore();

  const [username, setUsername] = useState(profile.username);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      <div className="flex h-full flex-col bg-canvas">
        {/* header */}
        <div className="flex items-center px-5 pb-3 pt-16">
          <h1 className="font-[family-name:var(--font-fredoka)] text-[28px] font-semibold leading-tight text-ink">
            Settings
          </h1>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-36">
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
                    style={{ boxShadow: "0 4px 16px rgba(91,84,232,.25)" }}
                  />
                ) : (
                  <div
                    className="flex h-[90px] w-[90px] items-center justify-center rounded-full text-[28px] font-bold text-white"
                    style={{
                      background: "linear-gradient(145deg,#6c63ff,#5045d8)",
                      boxShadow: "0 4px 16px rgba(91,84,232,.25)",
                    }}
                  >
                    {initials}
                  </div>
                )}
                <div
                  className="absolute bottom-0 right-0 flex h-[28px] w-[28px] items-center justify-center rounded-full bg-brand text-white"
                  style={{ boxShadow: "0 2px 6px rgba(80,69,216,.4)" }}
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
                border: "1px solid rgba(91,84,232,.12)",
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
                            background: "#5B54E8",
                            fontWeight: 600,
                            color: "#fff",
                            boxShadow: "0 2px 8px rgba(91,84,232,.35)",
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
              onClick={() => router.push("/")}
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
            ClassPin version 20.11
          </p>
        </div>

        <TabBar />
      </div>
    </PhoneFrame>
  );
}
