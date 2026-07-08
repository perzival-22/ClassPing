"use client";

import Link from "next/link";
import { PhoneFrame } from "@/components/PhoneFrame";
import { BellSolid, ClockIcon, FlagIcon } from "@/components/icons";

const NOTIFS = [
  {
    grad: "linear-gradient(145deg,#FF8A6E,#FF5A44)",
    icon: <BellSolid className="h-[21px] w-[21px] text-white" />,
    time: "now",
    title: "Foundations of ML starts at 10:00 AM",
    body: "That's in 15 minutes — head to Friend 101.",
  },
  {
    grad: "linear-gradient(145deg,#FFC24D,#F5A623)",
    icon: <ClockIcon className="h-[21px] w-[21px] text-white" />,
    time: "8:00 AM",
    title: "Due in 24 hours",
    body: "Lab report: Aldol condensation — Organic Chemistry II.",
  },
  {
    grad: "linear-gradient(145deg,#7C74F0,#5045D8)",
    icon: <FlagIcon className="h-[21px] w-[21px] text-white" />,
    time: "yesterday",
    title: "Still working on this one?",
    body: "Reading response: Rawls — tap ✓ when it's done.",
  },
];

export default function LockScreen() {
  return (
    <PhoneFrame dark>
      <div
        className="relative flex h-full flex-col items-center px-3.5"
        style={{
          background:
            "linear-gradient(165deg,#3A2E7A 0%,#5B3E8F 45%,#7A4D8C 100%)",
        }}
      >
        {/* clock */}
        <div className="mt-[74px] text-center">
          <div className="text-[20px] font-medium text-white/85">
            Monday, July 6
          </div>
          <div className="text-[76px] font-semibold leading-none tracking-tight text-white">
            9:41
          </div>
        </div>

        {/* notifications */}
        <div className="mt-8 flex w-full flex-col gap-[11px]">
          {NOTIFS.map((n, i) => (
            <div
              key={i}
              className="flex gap-3 rounded-[22px] px-[15px] py-3.5"
              style={{
                background: "rgba(255,255,255,.18)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "0.5px solid rgba(255,255,255,.14)",
              }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
                style={{ background: n.grad }}
              >
                {n.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <div className="text-[13px] font-bold text-white">
                    CLASSPING
                  </div>
                  <div className="text-[12px] text-white/60">{n.time}</div>
                </div>
                <div className="mt-[3px] text-[14.5px] font-semibold text-white">
                  {n.title}
                </div>
                <div className="mt-px text-[14px] text-white/80">{n.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        {/* bottom controls → tap the bell to enter the app */}
        <div className="flex w-full justify-between px-8 pb-[50px]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 10V8a6 6 0 0112 0v2M5 10h14v9a2 2 0 01-2 2H7a2 2 0 01-2-2z"
                stroke="#fff"
                strokeWidth="1.8"
              />
            </svg>
          </div>
          <Link
            href="/week"
            aria-label="Open ClassPing"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white transition active:scale-95"
          >
            <BellSolid className="h-[22px] w-[22px]" />
          </Link>
        </div>
      </div>
    </PhoneFrame>
  );
}
