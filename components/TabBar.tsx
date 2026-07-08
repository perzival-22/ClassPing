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

        <button
          aria-label="Add"
          onClick={() => router.push(addHref)}
          className="btn-brand -mt-6 flex h-[54px] w-[54px] items-center justify-center rounded-full text-white transition active:scale-95"
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
