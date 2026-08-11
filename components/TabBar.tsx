"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { tierFor } from "@/lib/pet";
import { useStore } from "@/lib/store";
import { levelFromXp } from "@/lib/xp";
import {
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
    <div
      className="absolute left-3 right-3 z-40"
      style={{ bottom: "max(env(safe-area-inset-bottom), 14px)" }}
    >
      <div className="glass flex items-start justify-between rounded-[30px] px-6 pb-2.5 pt-3">
        <TabItem
          href="/home"
          label="Home"
          active={pathname.startsWith("/home")}
          icon={HomeIcon}
        />

        <TabItem
          href="/week"
          label="Week"
          active={pathname.startsWith("/week")}
          icon={CalendarIcon}
        />

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

        <TabItem href="/tasks" label="Tasks" active={onTasks} icon={TasksIcon} />

        <TabItem
          href="/settings"
          label="Settings"
          active={pathname.startsWith("/settings")}
          icon={SettingsIcon}
        />
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
