import { Role, ShiftStatus, SwapRequestStatus } from "@prisma/client";
import {
  addDays,
  addWeeks,
  format,
  getISOWeek,
  getISOWeekYear,
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
import { cookies } from "next/headers";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { ShiftQuickActions } from "@/components/shift-quick-actions";
import { WeekPlannerDialog } from "@/components/week-planner-dialog";
import { buttonClass, secondaryButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message } from "@/components/ui/message";
import { requireMembership } from "@/lib/auth";
import {
  hasShiftOverlap,
  isAvailableOnShiftDay,
} from "@/lib/availability";
import { prisma } from "@/lib/db";
import { getShiftMinutes } from "@/lib/hours";
import { getDateLocale, getMessages } from "@/lib/i18n";
import { formatMinutes } from "@/lib/utils";
import {
  claimOpenShiftAction,
  decideShiftSwapRequestAction,
  requestShiftSwapAction,
} from "@/server/actions/shifts";
import { updateScheduleViewAction } from "@/server/actions/preferences";

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
  const savedView = (await cookies()).get("openroster_schedule_view")?.value;
  const view =
    query.view === "calendar" || query.view === "list"
      ? query.view
      : savedView === "calendar"
        ? "calendar"
        : "list";
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
  const planningWeekStarts = Array.from({ length: 20 }, (_, index) =>
    addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), index),
  );
  const planningRangeStart = fromZonedTime(
    `${format(planningWeekStarts[0], "yyyy-MM-dd")}T00:00`,
    membership.organization.timeZone,
  );
  const planningRangeEnd = fromZonedTime(
    `${format(addWeeks(planningWeekStarts.at(-1)!, 1), "yyyy-MM-dd")}T00:00`,
    membership.organization.timeZone,
  );

  const [
    shifts,
    openShifts,
    activeMembers,
    swapRequests,
    templates,
    planningShifts,
  ] = await Promise.all([
    prisma.shift.findMany({
      where: {
        organizationId: membership.organizationId,
        startTime: { gte: from, lt: to },
        ...(!isAdmin
          ? {
              status: ShiftStatus.PUBLISHED,
              assignments: { some: { membershipId: membership.id } },
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
    !isAdmin && membership.organization.allowOpenShifts
      ? prisma.shift.findMany({
          where: {
            organizationId: membership.organizationId,
            status: ShiftStatus.PUBLISHED,
            isOpen: true,
            startTime: { gte: from, lt: to },
            assignments: { none: { membershipId: membership.id } },
          },
          include: {
            assignments: {
              include: { membership: { include: { user: true } } },
            },
          },
          orderBy: { startTime: "asc" },
        })
      : Promise.resolve([]),
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
    isAdmin
      ? prisma.shiftTemplate.findMany({
          where: { organizationId: membership.organizationId },
          orderBy: [{ title: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.shift.findMany({
          where: {
            organizationId: membership.organizationId,
            startTime: { gte: planningRangeStart, lt: planningRangeEnd },
          },
          include: {
            assignments: {
              include: { membership: { include: { user: true } } },
            },
          },
          orderBy: { startTime: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const availableOpenShifts = openShifts.filter(
    (shift) =>
      shift.assignments.length <
        membership.organization.maxMembersPerShift &&
      isAvailableOnShiftDay({
        startTime: shift.startTime,
        timeZone: membership.organization.timeZone,
        organizationWorkingDays: membership.organization.workingDays,
        memberAvailableWeekdays: membership.availableWeekdays,
      }) &&
      !hasShiftOverlap(shifts, shift.startTime, shift.endTime),
  );
  const visibleListDays = isAdmin
    ? days
    : days.filter((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        return shifts.some(
          (shift) =>
            formatInTimeZone(
              shift.startTime,
              membership.organization.timeZone,
              "yyyy-MM-dd",
            ) === dateKey,
        );
      });
  const plannedWeekKeys = new Set(
    planningShifts.map((shift) => {
      const localDate = parseISO(
        formatInTimeZone(
          shift.startTime,
          membership.organization.timeZone,
          "yyyy-MM-dd",
        ),
      );
      return format(
        startOfWeek(localDate, { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
    }),
  );
  const nextWeekKey = format(planningWeekStarts[1], "yyyy-MM-dd");
  const defaultPlanningWeek =
    planningWeekStarts
      .slice(1)
      .map((date) => format(date, "yyyy-MM-dd"))
      .find((key) => !plannedWeekKeys.has(key)) ?? nextWeekKey;
  const weekOptions = planningWeekStarts.map((date) => ({
    value: format(date, "yyyy-MM-dd"),
    label: `${messages.calendarWeekShort} ${getISOWeek(date)}/${getISOWeekYear(
      date,
    )} · ${format(date, "PP", { locale: dateLocale })} ${messages.to} ${format(
      addDays(date, 6),
      "PP",
      { locale: dateLocale },
    )}`,
  }));
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
            <div className="flex flex-wrap gap-2">
              <WeekPlannerDialog
                weeks={weekOptions}
                defaultWeekStart={defaultPlanningWeek}
                templates={templates.map((template) => ({
                  id: template.id,
                  title: template.title,
                  startMinutes: template.startMinutes,
                  durationMinutes: template.durationMinutes,
                  breakMinutes: template.breakMinutes,
                  location: template.location,
                }))}
                existingShifts={planningShifts.map((shift) => ({
                  id: shift.id,
                  templateId: shift.templateId,
                  date: formatInTimeZone(
                    shift.startTime,
                    membership.organization.timeZone,
                    "yyyy-MM-dd",
                  ),
                  title: shift.title,
                  startTime: formatInTimeZone(
                    shift.startTime,
                    membership.organization.timeZone,
                    "HH:mm",
                  ),
                  endTime: formatInTimeZone(
                    shift.endTime,
                    membership.organization.timeZone,
                    "HH:mm",
                  ),
                  breakMinutes: shift.breakMinutes,
                  location: shift.location,
                  status: shift.status,
                  membershipIds: shift.assignments.map(
                    (assignment) => assignment.membershipId,
                  ),
                }))}
                members={activeMembers.map((member) => ({
                  id: member.id,
                  name: member.user.name,
                  role: member.role,
                  weeklyTargetMinutes: member.weeklyTargetMinutes,
                  availableWeekdays: member.availableWeekdays,
                }))}
                workingDays={membership.organization.workingDays}
                maxMembersPerShift={
                  membership.organization.maxMembersPerShift
                }
                messages={messages}
              />
              <Link href="/app/schedule/new" className={secondaryButtonClass}>
                {messages.createShift}
              </Link>
            </div>
          ) : undefined
        }
      />
      <div className="grid gap-5">
        <Message error={query.error} success={query.success} />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Link
            href={weekHref(addWeeks(weekStart, -1))}
            className={`${secondaryButtonClass} justify-self-start gap-1 px-3 sm:gap-2 sm:px-4`}
            aria-label={messages.previousWeek}
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">{messages.previousWeek}</span>
          </Link>
          <Link
            href={`/app/schedule?view=${view}`}
            className={`${secondaryButtonClass} px-3 sm:px-4`}
          >
            {messages.currentWeek}
          </Link>
          <Link
            href={weekHref(addWeeks(weekStart, 1))}
            className={`${secondaryButtonClass} justify-self-end gap-1 px-3 sm:gap-2 sm:px-4`}
            aria-label={messages.nextWeek}
          >
            <span className="hidden sm:inline">{messages.nextWeek}</span>
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <div className="hidden justify-end gap-2 md:flex">
          <form action={updateScheduleViewAction}>
            <input type="hidden" name="view" value="list" />
            <input
              type="hidden"
              name="returnTo"
              value={`/app/schedule?week=${format(weekStart, "yyyy-MM-dd")}&view=list`}
            />
            <button
              type="submit"
              className={view === "list" ? buttonClass : secondaryButtonClass}
            >
              <List className="mr-2 size-4" />
              {messages.listView}
            </button>
          </form>
          <form action={updateScheduleViewAction}>
            <input type="hidden" name="view" value="calendar" />
            <input
              type="hidden"
              name="returnTo"
              value={`/app/schedule?week=${format(weekStart, "yyyy-MM-dd")}&view=calendar`}
            />
            <button
              type="submit"
              className={
                view === "calendar" ? buttonClass : secondaryButtonClass
              }
            >
              <CalendarDays className="mr-2 size-4" />
              {messages.calendarView}
            </button>
          </form>
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

        {!isAdmin && availableOpenShifts.length > 0 ? (
          <Card>
            <h2 className="text-lg font-bold">
              {messages.availableOpenShifts}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {messages.availableOpenShiftsHint}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {availableOpenShifts.map((shift) => (
                <article
                  key={shift.id}
                  className="rounded-xl border bg-emerald-50/50 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#136f63]">
                    {formatInTimeZone(
                      shift.startTime,
                      membership.organization.timeZone,
                      "EEE, dd.MM.",
                      { locale: dateLocale },
                    )}
                  </p>
                  <p className="mt-2 font-bold">{shift.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
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
                    )}{" "}
                    · {formatMinutes(getShiftMinutes(shift))}
                  </p>
                  {shift.location ? (
                    <p className="mt-1 text-sm text-slate-500">
                      {shift.location}
                    </p>
                  ) : null}
                  <EmployeeShiftActions
                    shift={shift}
                    membershipId={membership.id}
                    returnTo={returnTo}
                    messages={messages}
                    allowOpenShifts
                    allowShiftSwaps={false}
                  />
                </article>
              ))}
            </div>
          </Card>
        ) : null}

        {view === "calendar" ? (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-[0_10px_30px_rgba(24,32,30,0.04)] md:overflow-x-auto">
            <div className="grid min-w-0 grid-cols-1 md:min-w-[1120px] md:grid-cols-7">
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
                    className={`min-w-0 border-b last:border-b-0 md:min-h-[34rem] md:border-b-0 md:border-r md:last:border-r-0 ${
                      dayShifts.length === 0 ? "hidden md:block" : ""
                    }`}
                  >
                    <header className="border-b bg-slate-50 p-3 text-left md:text-center">
                      <p className="text-xs font-semibold uppercase text-[#136f63]">
                        {format(day, "EEE", { locale: dateLocale })}
                      </p>
                      <p className="mt-1 font-bold">
                        {format(day, "PP", { locale: dateLocale })}
                      </p>
                    </header>
                    <div className="grid gap-3 p-3 md:p-2">
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
          {!isAdmin && visibleListDays.length === 0 ? (
            <Card className="border-dashed text-center">
              <CalendarDays className="mx-auto size-7 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-500">
                {messages.noShiftsThisWeek}
              </p>
            </Card>
          ) : null}
          {visibleListDays.map((day) => {
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
                <div className="border-b pb-3 lg:border-b-0 lg:pb-0">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#136f63]">
                    {format(day, "EEEE", { locale: dateLocale })}
                  </p>
                  <p className="mt-1 text-lg font-bold sm:text-xl">
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
