"use client";

import {
  CalendarDays,
  Clock3,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppMessages } from "@/lib/i18n";

export function MobileAppNav({
  role,
  messages,
}: {
  role: "OWNER" | "ADMIN" | "EMPLOYEE";
  messages: AppMessages;
}) {
  const pathname = usePathname();
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const links = [
    { href: "/app", label: messages.dashboard, icon: LayoutDashboard },
    {
      href: "/app/schedule",
      label: isAdmin ? messages.schedule : messages.myShifts,
      icon: CalendarDays,
    },
    ...(isAdmin
      ? [{ href: "/app/employees", label: messages.employees, icon: Users }]
      : []),
    {
      href: "/app/hours",
      label: isAdmin ? messages.hours : messages.myHours,
      icon: Clock3,
    },
    { href: "/app/settings", label: messages.settings, icon: Settings },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(24,32,30,0.08)] backdrop-blur lg:hidden"
      aria-label="App navigation"
    >
      <div
        className="mx-auto grid max-w-xl"
        style={{
          gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))`,
        }}
      >
        {links.map((link) => {
          const active =
            link.href === "/app"
              ? pathname === link.href
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold ${
                active
                  ? "bg-emerald-50 text-[#136f63]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <link.icon className="size-5" strokeWidth={active ? 2.5 : 2} />
              <span className="max-w-full truncate">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
