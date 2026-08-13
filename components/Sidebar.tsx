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

/**
 * The desktop navigation rail — what replaces TabBar from `md` up.
 *
 * The phone bar carries four destinations because a thumb can only reach four;
 * a sidebar has room for the fifth (Grades), which on mobile is reachable only
 * through a card buried on Home. Same routes, same order, one more of them.
 *
 * Two widths, no toggle: an icon rail on tablets and a labelled column from
 * `xl`. A collapse control is a preference to store, sync and get wrong, and
 * the breakpoint already knows the answer.
 */

const NAV = [
  { href: "/home", label: "Today", icon: HomeIcon },
  { href: "/classes", label: "Classes", icon: BookIcon },
  { href: "/week", label: "Week", icon: CalendarIcon },
  { href: "/tasks", label: "Tasks", icon: TasksIcon },
  { href: "/grades", label: "Grades", icon: GradeIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { xp, pet, profile, hydrated } = useStore();

  /**
   * Same aura, same ladder as the pet and the tab bar's add button. It rides
   * the one control that is on every screen here too — and like the tab bar,
   * it never animates: navigation furniture doesn't celebrate.
   */
  const tier = shownTier(levelFromXp(xp.xp), pet);

  // What "Add" means follows the screen you're on, exactly as it does on the
  // phone — so the keyboard shortcut and the button never disagree.
  const addHref = pathname.startsWith("/tasks")
    ? "/tasks/new"
    : pathname.startsWith("/grades")
      ? "/grades/new"
      : "/class/new";

  return (
    <aside
      className="hidden shrink-0 flex-col md:flex md:w-[88px] xl:w-[248px]"
      style={{
        background: "var(--bg-card)",
        borderRight: "1px solid var(--line)",
      }}
    >
      {/* wordmark */}
      <Link
        href="/home"
        className="flex items-center justify-center gap-3 px-4 pb-2 pt-6 xl:justify-start xl:px-5"
      >
        <span
          className="brand-logo-grad flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] text-white xl:h-[40px] xl:w-[40px]"
          style={{ boxShadow: "0 8px 18px rgba(var(--brand-rgb),.32)" }}
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
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
        </span>
        <span className="hidden font-[family-name:var(--font-fredoka)] text-[20px] font-semibold text-ink xl:block">
          ClassPing
        </span>
      </Link>

      {/* add */}
      <div className="px-4 pb-1 pt-5 xl:px-5">
        <span className="relative flex">
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-[16px]"
            style={{
              inset: -2,
              background: tier.ring,
              opacity: 0.55,
              boxShadow: `0 0 12px ${tier.glow}`,
            }}
          />
          <button
            onClick={() => router.push(addHref)}
            className="btn-brand relative flex h-[46px] w-full items-center justify-center gap-2 rounded-[15px] text-[15px] font-semibold text-white transition active:scale-[0.98]"
          >
            <PlusIcon className="h-5 w-5" />
            <span className="hidden xl:block">Add</span>
          </button>
        </span>
      </div>

      {/* destinations */}
      <nav className="flex flex-col gap-1 px-3 pt-4 xl:px-4">
        {NAV.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </nav>

      <div className="flex-1" />

      {/* who's signed in — the phone puts this on Settings, but a sidebar has
          the room and an account you can see is one you trust is synced. */}
      <Link
        href="/settings"
        className="mx-3 mb-5 mt-4 flex items-center justify-center gap-3 rounded-[14px] px-3 py-2.5 transition hover:brightness-[.98] xl:mx-4 xl:justify-start"
        style={{ background: "var(--surface-2)" }}
      >
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold text-white"
          style={{ background: "var(--color-brand)" }}
        >
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            (profile.username.trim()[0] || "?").toUpperCase()
          )}
        </span>
        <span className="hidden min-w-0 flex-1 xl:block">
          <span className="block truncate text-[13px] font-semibold text-ink">
            {hydrated ? profile.username || "Your account" : " "}
          </span>
          <span className="block text-[11px] text-muted-2">
            Level {levelFromXp(xp.xp)}
          </span>
        </span>
      </Link>
    </aside>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      className="flex items-center justify-center gap-3 rounded-[14px] px-3 py-2.5 transition xl:justify-start xl:px-3.5"
      style={{
        background: active ? "var(--brand-soft)" : "transparent",
        color: active ? "var(--color-brand)" : "var(--color-muted)",
      }}
    >
      <Icon className="h-[22px] w-[22px] shrink-0" />
      <span className="hidden text-[14.5px] font-semibold xl:block">
        {label}
      </span>
    </Link>
  );
}
