import { Role, ShiftStatus } from "@prisma/client";
import { addMonths, format, parseISO, subMilliseconds } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { PageHeading } from "@/components/page-heading";
import { Button, secondaryButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateBalance } from "@/lib/hours";
import { getDateLocale, getMessages } from "@/lib/i18n";
import { formatMinutes } from "@/lib/utils";
import { createAdjustmentAction } from "@/server/actions/hours";

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const actor = await requireMembership();
  const query = await searchParams;
  const isAdmin = actor.role === Role.OWNER || actor.role === Role.ADMIN;
  const messages = getMessages(actor.user.language);
  const dateLocale = getDateLocale(actor.user.language);
  const monthKey = /^\d{4}-\d{2}$/.test(query.month ?? "")
    ? (query.month as string)
    : formatInTimeZone(new Date(), actor.organization.timeZone, "yyyy-MM");
  const localMonthStart = parseISO(`${monthKey}-01`);
  const nextLocalMonth = addMonths(localMonthStart, 1);
  const rangeStart = fromZonedTime(
    `${format(localMonthStart, "yyyy-MM-dd")}T00:00`,
    actor.organization.timeZone,
  );
  const rangeEndExclusive = fromZonedTime(
    `${format(nextLocalMonth, "yyyy-MM-dd")}T00:00`,
    actor.organization.timeZone,
  );
  const now = new Date();
  const calculationEnd =
    now < rangeEndExclusive ? now : subMilliseconds(rangeEndExclusive, 1);

  const members = await prisma.membership.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(isAdmin ? {} : { id: actor.id }),
    },
    include: {
      user: true,
      shiftAssignments: {
        where: {
          shift: {
            status: ShiftStatus.PUBLISHED,
            startTime: { gte: rangeStart, lt: rangeEndExclusive },
            endTime: { lte: calculationEnd },
          },
        },
        include: { shift: true },
      },
      adjustments: {
        where: { createdAt: { gte: rangeStart, lt: rangeEndExclusive } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  const rows = members.map((member) => ({
    member,
    balance: calculateBalance({
      shifts: member.shiftAssignments.map((assignment) => assignment.shift),
      adjustmentMinutes: member.adjustments.reduce(
        (total, adjustment) => total + adjustment.minutes,
        0,
      ),
      weeklyTargetMinutes: member.weeklyTargetMinutes,
      from: member.createdAt > rangeStart ? member.createdAt : rangeStart,
      to: calculationEnd,
    }),
  }));

  return (
    <>
      <PageHeading
        title={isAdmin ? messages.hourAccounts : messages.myHours}
        description={format(localMonthStart, "MMMM yyyy", {
          locale: dateLocale,
        })}
      />
      <div className="grid gap-6">
        <Message error={query.error} success={query.success} />
        <div className="flex flex-wrap gap-3">
          <a
            href={`/app/hours?month=${format(addMonths(localMonthStart, -1), "yyyy-MM")}`}
            className={secondaryButtonClass}
          >
            {messages.previousMonth}
          </a>
          <a href="/app/hours" className={secondaryButtonClass}>
            {messages.currentMonth}
          </a>
          <a
            href={`/app/hours?month=${format(addMonths(localMonthStart, 1), "yyyy-MM")}`}
            className={secondaryButtonClass}
          >
            {messages.nextMonth}
          </a>
        </div>

        {isAdmin ? (
          <Card>
            <div className="mb-5">
              <p className="text-sm font-semibold text-slate-500">
                {messages.manualEntry}
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {messages.adjustHours}
              </h2>
            </div>
            <form
              action={createAdjustmentAction}
              className="grid gap-4 md:grid-cols-[1fr_10rem_2fr_auto] md:items-end"
            >
              <Field label={messages.employees}>
                <Select name="membershipId" required>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.user.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={messages.minutes}>
                <Input
                  name="minutes"
                  type="number"
                  placeholder="+/-"
                  required
                />
              </Field>
              <Field label={messages.reason}>
                <Input name="reason" minLength={3} required />
              </Field>
              <Button type="submit">{messages.add}</Button>
            </form>
          </Card>
        ) : null}

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{messages.employees}</th>
                  <th className="px-5 py-3">{messages.worked}</th>
                  <th className="px-5 py-3">{messages.target}</th>
                  <th className="px-5 py-3">{messages.adjustments}</th>
                  <th className="px-5 py-3">{messages.balance}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ member, balance }) => {
                  const adjustmentMinutes = member.adjustments.reduce(
                    (total, adjustment) => total + adjustment.minutes,
                    0,
                  );
                  return (
                    <tr key={member.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold">{member.user.name}</p>
                        <p className="text-slate-500">{member.user.email}</p>
                      </td>
                      <td className="px-5 py-4 font-medium">
                        {formatMinutes(balance.workedMinutes)}
                      </td>
                      <td className="px-5 py-4">
                        {formatMinutes(balance.targetMinutes)}
                      </td>
                      <td className="px-5 py-4">
                        {adjustmentMinutes > 0 ? "+" : ""}
                        {formatMinutes(adjustmentMinutes)}
                      </td>
                      <td
                        className={`px-5 py-4 font-bold ${
                          balance.balanceMinutes >= 0
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {balance.balanceMinutes > 0 ? "+" : ""}
                        {formatMinutes(balance.balanceMinutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-slate-500">
          {messages.targetExplanation}
        </p>
      </div>
    </>
  );
}
