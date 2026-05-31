"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Palette, Users } from "lucide-react";
import clsx from "clsx";
import type { AuthUser } from "@/lib/auth/permissions";
import { getFormalAppNavItems, type AppNavItem } from "@/lib/app-navigation";

type AppSideNavProps = {
  currentPath: string;
  currentUser: AuthUser;
};

const iconByName: Record<AppNavItem["icon"], typeof CalendarDays> = {
  calendar: CalendarDays,
  guide: ClipboardList,
  modeling: Palette,
  users: Users,
};

export function AppSideNav({ currentPath, currentUser }: AppSideNavProps) {
  const router = useRouter();
  const items = getFormalAppNavItems(currentUser);

  return (
    <nav className="mt-5 grid gap-2">
      {items.map((item) => {
        const Icon = iconByName[item.icon];
        const active = item.href === "/" ? currentPath === "/" : currentPath.startsWith(item.href);

        return (
          <button
            key={item.href}
            type="button"
            onClick={() => router.push(item.href)}
            className={clsx(
              "flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold transition",
              active ? "bg-rose-50 text-rose-700" : "text-slate-500 hover:bg-slate-50",
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Icon size={16} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className={clsx("rounded-full px-2 py-0.5 text-xs", active ? "bg-rose-100" : "bg-slate-100")}>{item.badge}</span>
          </button>
        );
      })}
    </nav>
  );
}

