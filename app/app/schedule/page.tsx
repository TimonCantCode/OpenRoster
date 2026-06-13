import { Role, ShiftStatus, SwapRequestStatus } from "@prisma/client";
import {
  addDays,
  addWeeks,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
} from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { ShiftQuickActions } from "@/components/shift-quick-actions";
import { buttonClass, secondaryButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message } from "@/components/ui/message";
import { requireMembership } from "@/lib/auth";
import {
  hasShiftOverlap,
  isAvailableOnShiftDay,
} from "@/lib/availability";
import { prisma } from "@/lib/db";
import { getDateLocale, getMessages } from "@/lib/i18n";
import {
  claimOpenShiftAction,
  decideShiftSwapRequestAction,
  publishWeekAction,
  requestShiftSwapAction,
} from "@/server/actions/shifts";

type ScheduleShift = {
  id: string;
  isOpen: boolean;
  assignments: Array<{ membershipId: string }>;
};

function EmployeeShiftActions({
  shift,
  membershipId,
  returnTo,
  messages,
  allowOpenShifts,
  allowShiftSwaps,
}: {
  shift: ScheduleShift;
  membershipId: string;
  returnTo: string;
  messages: ReturnType<typeof getMessages>;
  allowOpenShifts: boolean;
  allowShiftSwaps: boolean;
}) {
  const isAssigned = shift.assignments.some(
    (assignment) => assignment.membershipId === membershipId,
  );

  if (!isAssigned && allowOpenShifts && shift.isOpen) {
    return (
      <form action={claimOpenShiftAction} className="mt-3">
        <input type="hidden" name="shiftId" value={shift.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          type="submit"
          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[#136f63] px-3 text-xs font-semibold text-white hover:bg-[#0d564d]"
        >
          {messages.claimShift}
        </button>
      </form>
    );
  }

  if (isAssigned && allowShiftSwaps) {
    return (
      <form action={requestShiftSwapAction} className="mt-3">
        <input type="hidden" name="shiftId" value={shift.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          type="submit"
          className="inline-flex min-h-9 items-center justify-center rounded-lg border bg-white px-3 text-xs font-semibold text-[#136f63] hover:bg-emerald-50"
        >
          {messages.requestSwap}
        </button>
      </form>
    );
  }

  return null;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    error?: string;
    success?: string;
    view?: string;
  }>;
}) {
  const membership = await requireMembership();
  const query = await searchParams;
  const isAdmin =
    membership.role === Role.OWNER || membership.role === Role.ADMIN;
  const messages = getMessages(membership.user.language);
  const dateLocale = getDateLocale(membership.user.language);
  const view = query.view === "calendar" ? "calendar" : "list";
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(query.week ?? "")
    ? parseISO(query.week as string)
    : new Date();
  const weekStart = startOfWeek(requestedDate, { weekStartsOn: 1 });
  const nextWeekStart = addDays(weekStart, 7);
  const from = fromZonedTime(
    `${format(weekStart, "yyyy-MM-dd")}T00:00`,
    membership.organization.timeZone,
  );
  const to = fromZonedTime(
    `${format(nextWeekStart, "yyyy-MM-dd")}T00:00`,
    membership.organization.timeZone,
  );

  const [shifts, activeMembers, swapRequests] = await Promise.all([
    prisma.shift.findMany({
      where: {
        organizationId: membership.organizationId,
        startTime: { gte: from, lt: to },
        ...(!isAdmin
          ? {
              status: ShiftStatus.PUBLISHED,
              OR: [
                { assignments: { some: { membershipId: membership.id } } },
                ...(membership.organization.allowOpenShifts
                  ? [{ isOpen: true }]
                  : []),
              ],
            }
          : {}),
      },
      include: {
        assignments: {
          include: { membership: { include: { user: true } } },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    isAdmin
      ? prisma.membership.findMany({
          where: {
            organizationId: membership.organizationId,
            isActive: true,
          },
          include: {
            user: true,
            shiftAssignments: {
              where: {
                shift: {
                  startTime: { lt: to },
                  endTime: { gt: from },
                },
              },
              include: { shift: true },
            },
          },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    isAdmin && membership.organization.allowShiftSwaps
      ? prisma.shiftSwapRequest.findMany({
          where: {
            organizationId: membership.organizationId,
            status: SwapRequestStatus.PENDING,
            shift: {
              startTime: { gte: from, lt: to },
            },
          },
          include: {
            requester: { include: { user: true } },
            shift: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const availableEmployees = new Map<string, Array<{ id: string; name: string }>>(
    shifts.map((shift) => {
      if (
        shift.assignments.length >= membership.organization.maxMembersPerShift
      ) {
        return [shift.id, [] as Array<{ id: string; name: string }>] as const;
      }
      const assignedIds = new Set(
        shift.assignments.map((assignment) => assignment.membershipId),
      );
      const available = activeMembers
        .filter(
          (member) =>
            !assignedIds.has(member.id) &&
            isAvailableOnShiftDay({
              startTime: shift.startTime,
              timeZone: membership.organization.timeZone,
              organizationWorkingDays: membership.organization.workingDays,
              memberAvailableWeekdays: member.availableWeekdays,
            }) &&
            !hasShiftOverlap(
              member.shiftAssignments
                .filter((assignment) => assignment.shiftId !== shift.id)
                .map((assignment) => assignment.shift),
              shift.startTime,
              shift.endTime,
            ),
        )
        .map((member) => ({ id: member.id, name: member.user.name }));
      return [shift.id, available] as const;
    }),
  );
  const returnTo = `/app/schedule?week=${format(weekStart, "yyyy-MM-dd")}&view=${view}`;
  const weekHref = (date: Date) =>
    `/app/schedule?week=${format(date, "yyyy-MM-dd")}&view=${view}`;

  return (
    <>
      <PageHeading
        title={isAdmin ? messages.schedule : messages.myShifts}
        description={`${messages.weekFrom} ${format(weekStart, "PP", { locale: dateLocale })} ${messages.to} ${format(
          addDays(weekStart, 6),
          "PP",
          { locale: dateLocale },
        )}`}
        action={
          isAdmin ? (
            <Link href="/app/schedule/new" className={buttonClass}>
              {messages.createShift}
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-5">
        <Message error={query.error} success={query.success} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={weekHref(addWeeks(weekStart, -1))}
            className={`${secondaryButtonClass} gap-2`}
          >
            <ChevronLeft className="size-4" /> {messages.previousWeek}
          </Link>
          <Link
            href={`/app/schedule?view=${view}`}
            className={secondaryButtonClass}
          >
            {messages.currentWeek}
          </Link>
          <Link
            href={weekHref(addWeeks(weekStart, 1))}
            className={`${secondaryButtonClass} gap-2`}
          >
            {messages.nextWeek} <ChevronRight className="size-4" />
          </Link>
        </div>

        <div className="flex justify-end gap-2">
          {isAdmin ? (
            <form action={publishWeekAction}>
              <input
                type="hidden"
                name="weekStart"
                value={format(weekStart, "yyyy-MM-dd")}
              />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className={secondaryButtonClass}
              >
                {messages.publishWeek}
              </button>
            </form>
          ) : null}
          <Link
            href={`/app/schedule?week=${format(weekStart, "yyyy-MM-dd")}&view=list`}
            className={view === "list" ? buttonClass : secondaryButtonClass}
          >
            <List className="mr-2 size-4" />
            {messages.listView}
          </Link>
          <Link
            href={`/app/schedule?week=${format(weekStart, "yyyy-MM-dd")}&view=calendar`}
            className={view === "calendar" ? buttonClass : secondaryButtonClass}
          >
            <CalendarDays className="mr-2 size-4" />
            {messages.calendarView}
          </Link>
        </div>

        {swapRequests.length > 0 ? (
          <Card>
            <h2 className="text-lg font-bold">{messages.pendingSwapRequests}</h2>
            <div className="mt-4 divide-y">
              {swapRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-semibold">{request.shift.title}</p>
                    <p className="text-sm text-slate-500">
                      {request.requester.user.name} ·{" "}
                      {formatInTimeZone(
                        request.shift.startTime,
                        membership.organization.timeZone,
                        "EEE, dd.MM. HH:mm",
                        { locale: dateLocale },
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={decideShiftSwapRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button type="submit" className={secondaryButtonClass}>
                        {messages.approve}
                      </button>
                    </form>
                    <form action={decideShiftSwapRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button type="submit" className={secondaryButtonClass}>
                        {messages.reject}
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {view === "calendar" ? (
          <div className="overflow-x-auto rounded-2xl border bg-white shadow-[0_10px_30px_rgba(24,32,30,0.04)]">
            <div className="grid min-w-[1120px] grid-cols-7">
              {days.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayShifts = shifts.filter(
                  (shift) =>
                    formatInTimeZone(
                      shift.startTime,
                      membership.organization.timeZone,
                      "yyyy-MM-dd",
                    ) === dateKey,
                );
                return (
                  <section
                    key={dateKey}
                    className="min-h-[34rem] min-w-0 border-r last:border-r-0"
                  >
                    <header className="border-b bg-slate-50 p-3 text-center">
                      <p className="text-xs font-semibold uppercase text-[#136f63]">
                        {format(day, "EEE", { locale: dateLocale })}
                      </p>
                      <p className="mt-1 font-bold">
                        {format(day, "PP", { locale: dateLocale })}
                      </p>
                    </header>
                    <div className="grid gap-3 p-2">
                      {dayShifts.map((shift) => (
                        <article
                          key={shift.id}
                          className="min-w-0 rounded-xl border bg-slate-50 p-3"
                        >
                          <p className="text-xs font-semibold text-[#136f63]">
                            {formatInTimeZone(
                              shift.startTime,
                              membership.organization.timeZone,
                              "HH:mm",
                            )}{" "}
                            -{" "}
                            {formatInTimeZone(
                              shift.endTime,
                              membership.organization.timeZone,
                              "HH:mm",
                            )}
                          </p>
                          <p className="mt-1 truncate font-bold">
                            {shift.title}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {isAdmin ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                                {shift.status === ShiftStatus.PUBLISHED
                                  ? messages.published
                                  : messages.draft}
                              </span>
                            ) : null}
                            {shift.isOpen ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                {messages.openShift}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {shift.assignments
                              .map(
                                (assignment) =>
                                  assignment.membership.user.name,
                              )
                              .join(", ") || messages.unassigned}
                          </p>
                          {isAdmin ? (
                            <div className="mt-3 border-t pt-3">
                              <ShiftQuickActions
                                shiftId={shift.id}
                                employees={
                                  availableEmployees.get(shift.id) ?? []
                                }
                                returnTo={returnTo}
                                messages={messages}
                                compact
                                canAssign={
                                  shift.assignments.length <
                                  membership.organization.maxMembersPerShift
                                }
                              />
                            </div>
                          ) : (
                            <EmployeeShiftActions
                              shift={shift}
                              membershipId={membership.id}
                              returnTo={returnTo}
                              messages={messages}
                              allowOpenShifts={
                                membership.organization.allowOpenShifts
                              }
                              allowShiftSwaps={
                                membership.organization.allowShiftSwaps
                              }
                            />
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
        <div className="grid gap-4">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayShifts = shifts.filter(
              (shift) =>
                formatInTimeZone(
                  shift.startTime,
                  membership.organization.timeZone,
                  "yyyy-MM-dd",
                ) === dateKey,
            );
            return (
              <Card key={dateKey} className="grid gap-4 lg:grid-cols-[10rem_1fr]">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#136f63]">
                    {format(day, "EEEE", { locale: dateLocale })}
                  </p>
                  <p className="mt-1 text-xl font-bold">
                    {format(day, "PP", { locale: dateLocale })}
                  </p>
                </div>
                <div className="grid gap-3">
                  {dayShifts.length === 0 ? (
                    <p className="py-2 text-sm text-slate-400">
                      {messages.noShifts}
                    </p>
                  ) : (
                    dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="grid gap-3 rounded-xl border bg-slate-50/60 p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-center"
                      >
                        <p className="font-semibold">
                          {formatInTimeZone(
                            shift.startTime,
                            membership.organization.timeZone,
                            "HH:mm",
                          )}{" "}
                          –{" "}
                          {formatInTimeZone(
                            shift.endTime,
                            membership.organization.timeZone,
                            "HH:mm",
                          )}
                        </p>
                        <div>
                          <p className="font-semibold">{shift.title}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {shift.assignments
                              .map(
                                (assignment) =>
                                  assignment.membership.user.name,
                              )
                              .join(", ") || messages.unassigned}
                            {shift.location ? ` - ${shift.location}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {isAdmin ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                                {shift.status === ShiftStatus.PUBLISHED
                                  ? messages.published
                                  : messages.draft}
                              </span>
                            ) : null}
                            {shift.isOpen ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                {messages.openShift}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {isAdmin ? (
                          <ShiftQuickActions
                            shiftId={shift.id}
                            employees={availableEmployees.get(shift.id) ?? []}
                            returnTo={returnTo}
                            messages={messages}
                            canAssign={
                              shift.assignments.length <
                              membership.organization.maxMembersPerShift
                            }
                          />
                        ) : (
                          <EmployeeShiftActions
                            shift={shift}
                            membershipId={membership.id}
                            returnTo={returnTo}
                            messages={messages}
                            allowOpenShifts={
                              membership.organization.allowOpenShifts
                            }
                            allowShiftSwaps={
                              membership.organization.allowShiftSwaps
                            }
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        )}
      </div>
    </>
  );
}
