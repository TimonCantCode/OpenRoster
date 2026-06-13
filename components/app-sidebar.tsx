import { Role } from "@prisma/client";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { MobileAppNav } from "@/components/mobile-app-nav";
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
    <>
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur lg:hidden">
        <div className="min-w-0">
          <Logo href="/app" />
          <p className="mt-0.5 max-w-[13rem] truncate text-xs text-slate-500">
            {organizationName}
          </p>
        </div>
        <details className="group relative">
          <summary
            className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm [&::-webkit-details-marker]:hidden"
            aria-label="Open account menu"
          >
            <Menu className="size-5" />
            <ChevronDown className="size-4 group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border bg-white p-3 shadow-xl">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                {role}
              </p>
            </div>
            {organizations.length > 1 ? (
              <form action={switchOrganizationAction} className="mt-3">
                <select
                  name="organizationId"
                  defaultValue={organizationId}
                  className="min-h-11 w-full rounded-lg border bg-white px-3 text-sm font-semibold"
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
                  className="mt-2 min-h-10 w-full rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-[#136f63]"
                >
                  {messages.switchOrganization}
                </button>
              </form>
            ) : null}
            <form action={logoutAction} className="mt-2">
              <button
                type="submit"
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="size-4" />
                {messages.signOut}
              </button>
            </form>
          </div>
        </details>
      </header>

      <MobileAppNav role={role} messages={messages} />

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white lg:flex">
        <div className="flex h-full w-full flex-col p-4">
          <div>
            <Logo href="/app" />
            <span className="mt-4 inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
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
              <p className="truncate text-sm font-semibold">
                {organizationName}
              </p>
            )}
            <p className="truncate text-xs text-slate-500">{userName}</p>
          </div>
          <nav className="mt-4 flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <link.icon className="size-4" />
                {link.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="mt-auto">
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
    </>
  );
}
