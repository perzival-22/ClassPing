"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const onTasks = pathname.startsWith("/tasks");

  const addHref = onTasks ? "/tasks/new" : "/class/new";

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 flex items-start justify-between px-4 pt-3"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 20px)",
        background: "var(--bg-tabbar)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "0.5px solid var(--border-tabbar)",
      }}
    >
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

      <button
        aria-label="Add"
        onClick={() => router.push(addHref)}
        className="btn-brand -mt-2 flex h-[52px] w-[52px] items-center justify-center rounded-full text-white transition active:scale-95"
      >
        <PlusIcon className="h-6 w-6" />
      </button>

      <TabItem href="/tasks" label="Tasks" active={onTasks} icon={TasksIcon} />

      <TabItem
        href="/settings"
        label="Settings"
        active={pathname.startsWith("/settings")}
        icon={SettingsIcon}
      />
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
      style={{ color: active ? "#5B54E8" : "#9A96B4" }}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[10px] font-semibold">{label}</span>
    </Link>
  );
}
