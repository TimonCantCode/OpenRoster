import { Role, ShiftStatus } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ArrowRight, CalendarDays, Mail, Users } from "lucide-react";
import Link from "next/link";
import { HoursBalance } from "@/components/hours-balance";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Message } from "@/components/ui/message";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateBalance, getShiftMinutes } from "@/lib/hours";
import { getDateLocale, getMessages } from "@/lib/i18n";
import { formatMinutes } from "@/lib/utils";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const membership = await requireMembership();
  const query = await searchParams;
  const isAdmin =
    membership.role === Role.OWNER || membership.role === Role.ADMIN;
  const messages = getMessages(membership.user.language);
  const dateLocale = getDateLocale(membership.user.language);
  const now = new Date();
  const monthKey = formatInTimeZone(
    now,
    membership.organization.timeZone,
    "yyyy-MM",
  );
  const monthStart = fromZonedTime(
    `${monthKey}-01T00:00`,
    membership.organization.timeZone,
  );
  const periodEnd = now;
  const targetStart =
    membership.createdAt > monthStart ? membership.createdAt : monthStart;

  const [monthShifts, adjustments, upcomingShifts, memberCount, inviteCount] =
    await Promise.all([
      prisma.shift.findMany({
        where: {
          organizationId: membership.organizationId,
          status: ShiftStatus.PUBLISHED,
          startTime: { gte: monthStart },
          endTime: { lte: periodEnd },
          assignments: { some: { membershipId: membership.id } },
        },
      }),
      prisma.timeAdjustment.aggregate({
        where: {
          organizationId: membership.organizationId,
          membershipId: membership.id,
          createdAt: { gte: monthStart, lte: periodEnd },
        },
        _sum: { minutes: true },
      }),
      prisma.shift.findMany({
        where: {
          organizationId: membership.organizationId,
          ...(!isAdmin ? { status: ShiftStatus.PUBLISHED } : {}),
          endTime: { gte: now },
          ...(!isAdmin
            ? { assignments: { some: { membershipId: membership.id } } }
            : {}),
        },
        include: {
          assignments: {
            include: { membership: { include: { user: true } } },
          },
        },
        orderBy: { startTime: "asc" },
        take: 5,
      }),
      isAdmin
        ? prisma.membership.count({
            where: { organizationId: membership.organizationId, isActive: true },
          })
        : Promise.resolve(0),
      isAdmin
        ? prisma.invite.count({
            where: {
              organizationId: membership.organizationId,
              acceptedAt: null,
              expiresAt: { gt: now },
            },
          })
        : Promise.resolve(0),
    ]);

  const balance = calculateBalance({
    shifts: monthShifts,
    adjustmentMinutes: adjustments._sum.minutes ?? 0,
    weeklyTargetMinutes: membership.weeklyTargetMinutes,
    from: targetStart,
    to: periodEnd,
  });

  return (
    <>
      <PageHeading
        title={`${messages.hello}, ${membership.user.name}`}
        description={`${messages.overviewFor} ${formatInTimeZone(now, membership.organization.timeZone, "MMMM yyyy", { locale: dateLocale })}.`}
        action={
          isAdmin ? (
            <Link
              href="/app/schedule/new"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#136f63] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d564d]"
            >
              {messages.newShift}
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-6">
        <Message error={query.error} success={query.success} />
        {isAdmin ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Users className="size-5" />
              </span>
              <div>
                <p className="text-sm text-slate-500">
                  {messages.activeEmployees}
                </p>
                <p className="text-2xl font-bold">{memberCount}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Mail className="size-5" />
              </span>
              <div>
                <p className="text-sm text-slate-500">
                  {messages.pendingInvites}
                </p>
                <p className="text-2xl font-bold">{inviteCount}</p>
              </div>
            </Card>
          </div>
        ) : null}

        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                {messages.personalHourBalance}
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {messages.currentMonth}
              </h2>
            </div>
            <Link
              href="/app/hours"
              className="flex items-center gap-1 text-sm font-semibold text-[#136f63]"
            >
              {messages.details} <ArrowRight className="size-4" />
            </Link>
          </div>
          <HoursBalance {...balance} messages={messages} />
        </Card>

        <Card>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                {isAdmin ? messages.team : messages.personal}
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {messages.upcomingShifts}
              </h2>
            </div>
            <Link
              href="/app/schedule"
              className="flex items-center gap-1 text-sm font-semibold text-[#136f63]"
            >
              {messages.all} <ArrowRight className="size-4" />
            </Link>
          </div>
          {upcomingShifts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
              <CalendarDays className="mx-auto mb-3 size-6" />
              {messages.noUpcomingShifts}
            </div>
          ) : (
            <div className="divide-y">
              {upcomingShifts.map((shift, index) => (
                <div
                  key={shift.id}
                  className={`grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr_auto] sm:items-center ${
                    !isAdmin && index === 0
                      ? "rounded-xl bg-emerald-50/60 px-4 first:pt-4 last:pb-4"
                      : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {formatInTimeZone(
                        shift.startTime,
                        membership.organization.timeZone,
                        "yyyy-MM-dd",
                      ) ===
                      formatInTimeZone(
                        now,
                        membership.organization.timeZone,
                        "yyyy-MM-dd",
                      )
                        ? messages.today
                        : formatInTimeZone(
                            shift.startTime,
                            membership.organization.timeZone,
                            "EEE, dd.MM.",
                            { locale: dateLocale },
                          )}
                    </p>
                    <p className="text-sm text-slate-500">
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
                  </div>
                  <div>
                    <p className="font-semibold">{shift.title}</p>
                    <p className="text-sm text-slate-500">
                      {isAdmin
                        ? shift.assignments
                            .map(
                              (assignment) =>
                                assignment.membership.user.name,
                            )
                            .join(", ") || messages.unassigned
                        : `${formatMinutes(getShiftMinutes(shift))} · ${shift.breakMinutes} ${messages.breakShort}`}
                    </p>
                  </div>
                  {shift.location ? (
                    <span className="text-sm text-slate-500">{shift.location}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
