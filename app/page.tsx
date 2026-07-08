"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "@/components/PhoneFrame";
import { EyeIcon } from "@/components/icons";
import { useStore } from "@/lib/store";

export default function SignInScreen() {
  const router = useRouter();
  const { setProfile } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const canSubmit = email.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    const username = email.split("@")[0] || email.trim();
    setProfile({ username });
    router.push("/home");
  }

  return (
    <PhoneFrame>
      <div
        className="flex h-full flex-col px-7 pb-10"
        style={{ background: "var(--bg-signin)" }}
      >
        <div className="flex flex-1 flex-col items-center justify-center">
          <div
            className="brand-logo-grad flex h-[84px] w-[84px] items-center justify-center rounded-[25px] text-white"
            style={{ boxShadow: "0 14px 30px rgba(80,69,216,.4)" }}
          >
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.2a4.8 4.8 0 00-4.8 4.8c0 4.6-1.9 5.8-1.9 5.8h13.4s-1.9-1.2-1.9-5.8A4.8 4.8 0 0012 3.2z"
                fill="#fff"
              />
              <path
                d="M10.3 19.4a2 2 0 003.4 0"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="mt-[22px] font-[family-name:var(--font-fredoka)] text-[36px] font-semibold leading-none text-ink">
            ClassPing
          </h1>
          <p className="mt-2 max-w-[230px] text-center text-[15px] leading-snug text-muted">
            Your classes and deadlines, right on time.
          </p>

          {/* segmented control */}
          <div className="mt-9 flex w-full rounded-[14px] bg-[#E3E0F2] p-1" style={{ background: "var(--bg-card)" }}>
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="flex-1 rounded-[11px] py-[10px] text-[15px] transition"
                style={
                  mode === m
                    ? {
                        background: "var(--color-brand, #5B54E8)",
                        fontWeight: 600,
                        color: "#fff",
                        boxShadow: "0 1px 3px rgba(0,0,0,.15)",
                      }
                    : { fontWeight: 500, color: "var(--color-muted)" }
                }
              >
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          {/* fields */}
          <div className="mt-4 flex w-full flex-col gap-3">
            <label
              className="rounded-[15px] bg-white px-4 py-[13px]"
              style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
            >
              <div className="text-[11px] font-semibold tracking-wide text-faint">
                EMAIL
              </div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-[3px] w-full bg-transparent text-[16px] text-ink outline-none"
                placeholder="student@gmail.com"
                autoComplete="email"
                type="email"
                inputMode="email"
              />
            </label>

            <label
              className="flex items-center justify-between rounded-[15px] bg-white px-4 py-[13px]"
              style={{ boxShadow: "0 1px 4px rgba(30,20,80,.06)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold tracking-wide text-faint">
                  PASSWORD
                </div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  className="mt-[3px] w-full bg-transparent text-[16px] tracking-wide text-ink outline-none placeholder:tracking-normal"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label="Toggle password visibility"
                className="pl-3 text-hint"
              >
                <EyeIcon className="h-[22px] w-[22px]" />
              </button>
            </label>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-brand w-full rounded-[17px] py-[17px] text-center text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {mode === "login" ? "Log in" : "Create account"}
        </button>
        <p className="mt-[18px] text-center text-[14px] text-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-semibold text-brand"
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </div>
    </PhoneFrame>
  );
}
