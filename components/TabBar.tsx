"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { tierFor } from "@/lib/pet";
import { useStore } from "@/lib/store";
import { levelFromXp } from "@/lib/xp";
import {
  BookIcon,
  CalendarIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
  TasksIcon,
} from "./icons";

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { xp } = useStore();
  const onTasks = pathname.startsWith("/tasks");

  /**
   * The aura, worn on the one control that is on every screen.
   *
   * Same rungs as the pet's — this is the second *expression* of one ladder,
   * not a second ladder. It reads at a glance and nowhere else does: the band
   * is a couple of pixels and it never animates, because a tab bar is
   * furniture. Before hydration `xp` is empty, so this starts at base and
   * settles up; a ring quietly improving is a fine thing to see, a ring
   * flashing between tiers is not, which is why nothing here transitions.
   */
  const tier = tierFor(levelFromXp(xp.xp));

  const addHref = onTasks
    ? "/tasks/new"
    : pathname.startsWith("/grades")
      ? "/grades/new"
      : "/class/new";

  return (
    // Phone only. From `md` up, Sidebar carries navigation — two of them at
    // once would be two answers to the same question.
    <div
      className="absolute left-3 right-3 z-40 md:hidden"
      style={{ bottom: "max(env(safe-area-inset-bottom), 14px)" }}
    >
      {/*
       * Two equal halves with the add button between them, rather than one row
       * of six spread by `justify-between`.
       *
       * Five destinations don't divide either side of a centre button, and the
       * naive row put two labels left of it and three right — which reads as an
       * add button that has slipped off centre, because it has. Giving each
       * half `flex-1` pins the button to the middle of the bar and lets the
       * uneven sides distribute inside their own halves, where nobody is
       * counting.
       *
       * px-2 because the halves now own the spacing; the bar is the one piece
       * of chrome that may never wrap, and it still has to survive 320px.
       */}
      <div className="glass flex items-start rounded-[30px] px-2 pb-2.5 pt-3">
        <div className="flex flex-1 justify-around">
          <TabItem
            href="/home"
            label="Home"
            active={pathname.startsWith("/home")}
            icon={HomeIcon}
          />

          {/*
           * Notes live here and nowhere else on a phone.
           *
           * `/classes` is the only route to a lecture — the class list opens
           * the note list opens the note — and until this tab existed the
           * sidebar was the only thing that linked to it. The sidebar is `md:`
           * and up. So on every phone the whole notes feature, reader included,
           * was reachable only by typing the URL.
           *
           * Grades is still absent from this bar and is *not* the same bug: the
           * GPA card on Home routes to it. Nothing on any phone-visible screen
           * routed here.
           */}
          <TabItem
            href="/classes"
            label="Classes"
            active={
              pathname.startsWith("/classes") || pathname.startsWith("/class/")
            }
            icon={BookIcon}
          />
        </div>

        <span className="relative -mt-6 flex shrink-0 items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              inset: -3,
              background: tier.ring,
              // Slight, not silent. The brand button has to stay the brightest
              // thing in the bar, so the aura sits under half opacity and lends
              // only its bloom above it.
              opacity: 0.55,
              boxShadow: `0 0 12px ${tier.glow}`,
            }}
          />
          {/* The button keeps .btn-brand's own shadow untouched: its inset
              highlight and drop shadow are the control's identity, and an
              inline sheen would have replaced both. Its white 1px border is
              already the same hairline by another name. */}
          <button
            aria-label="Add"
            onClick={() => router.push(addHref)}
            className="btn-brand relative flex h-[54px] w-[54px] items-center justify-center rounded-full text-white transition active:scale-95"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        </span>

        <div className="flex flex-1 justify-around">
          <TabItem
            href="/week"
            label="Week"
            active={pathname.startsWith("/week")}
            icon={CalendarIcon}
          />

          <TabItem href="/tasks" label="Tasks" active={onTasks} icon={TasksIcon} />

          <TabItem
            href="/settings"
            label="Settings"
            active={pathname.startsWith("/settings")}
            icon={SettingsIcon}
          />
        </div>
      </div>
    </div>
  );
}

function TabItem({
  href,
  label,
  active,
  icon: Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1"
      style={{ color: active ? "var(--color-brand)" : "var(--color-faint)" }}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[10px] font-semibold">{label}</span>
    </Link>
  );
}
