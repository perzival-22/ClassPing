"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { shownTier } from "@/lib/pet";
import { useStore } from "@/lib/store";
import { levelFromXp } from "@/lib/xp";
import {
  BookIcon,
  CalendarIcon,
  GradeIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
  TasksIcon,
} from "./icons";

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { xp, pet } = useStore();
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
  const tier = shownTier(levelFromXp(xp.xp), pet);

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
       * Two equal halves with the add button between them.
       *
       * Six destinations, three a side, so the button sits on the true centre
       * and both halves carry the same weight. Each half is `flex-1` rather
       * than the whole row being `justify-between`: that keeps the button
       * centred by construction instead of by however wide the labels happen
       * to be, which is what went wrong when the count was five.
       *
       * px-1.5 and a 9.5px label because six labels plus a 54px button is the
       * most this bar will ever hold on a 320px phone. It is the one piece of
       * chrome that may never wrap, so the sizes here are measured rather than
       * chosen — checked at 320, 360, 390 and 430.
       */}
      <div className="glass flex items-start rounded-[30px] px-1.5 pb-2.5 pt-3">
        <div className="flex flex-1 justify-around">
          <TabItem
            href="/home"
            label="Home"
            active={pathname.startsWith("/home")}
            icon={HomeIcon}
          />

          {/*
           * Labelled "Notes", though the route is `/classes` and the sidebar
           * calls it Classes.
           *
           * The names disagree deliberately. On a laptop this is where you
           * manage a timetable; on a phone the class list is a doorway you pass
           * through on the way to a lecture, and the screen's own subtitle has
           * always said "pick one to open its notes". A tab is four characters
           * of explanation, so it should name the destination rather than the
           * hallway.
           */}
          <TabItem
            href="/classes"
            label="Notes"
            active={
              pathname.startsWith("/classes") || pathname.startsWith("/class/")
            }
            icon={BookIcon}
          />

          <TabItem
            href="/grades"
            label="Grades"
            active={pathname.startsWith("/grades")}
            icon={GradeIcon}
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
      className="flex min-w-0 flex-col items-center gap-1"
      style={{ color: active ? "var(--color-brand)" : "var(--color-faint)" }}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[9.5px] font-semibold">{label}</span>
    </Link>
  );
}
