import { Role } from "@prisma/client";
import {
  CalendarDays,
  Clock3,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import type { AppMessages } from "@/lib/i18n";
import {
  logoutAction,
  switchOrganizationAction,
} from "@/server/actions/auth";

export function AppSidebar({
  role,
  organizationName,
  organizationId,
  organizations,
  userName,
  messages,
}: {
  role: Role;
  organizationName: string;
  organizationId: string;
  organizations: Array<{ id: string; name: string }>;
  userName: string;
  messages: AppMessages;
}) {
  const isAdmin = role === Role.OWNER || role === Role.ADMIN;
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
    <aside className="border-b bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col p-4">
        <div className="flex items-center justify-between lg:block">
          <Logo href="/app" />
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 lg:mt-4 lg:inline-block">
            {role}
          </span>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          {organizations.length > 1 ? (
            <form action={switchOrganizationAction}>
              <select
                name="organizationId"
                defaultValue={organizationId}
                className="w-full bg-transparent text-sm font-semibold outline-none"
                aria-label={messages.switchOrganization}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="mt-2 text-xs font-semibold text-[#136f63]"
              >
                {messages.switchOrganization}
              </button>
            </form>
          ) : (
            <p className="truncate text-sm font-semibold">{organizationName}</p>
          )}
          <p className="truncate text-xs text-slate-500">{userName}</p>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <link.icon className="size-4" />
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="mt-2 lg:mt-auto">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="size-4" />
            {messages.signOut}
          </button>
        </form>
      </div>
    </aside>
  );
}
