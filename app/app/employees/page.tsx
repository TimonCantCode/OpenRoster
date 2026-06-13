import { Role } from "@prisma/client";
import { format } from "date-fns";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import { WeekdaySelector } from "@/components/weekday-selector";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDateLocale, getMessages } from "@/lib/i18n";
import { updateMembershipAction } from "@/server/actions/employees";
import { createInviteAction } from "@/server/actions/invites";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const messages = await searchParams;
  const ui = getMessages(actor.user.language);
  const dateLocale = getDateLocale(actor.user.language);
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: actor.organizationId },
      include: { user: true },
      orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
    }),
    prisma.invite.findMany({
      where: {
        organizationId: actor.organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeading
        title={ui.employees}
        description={ui.employeeManagement}
      />
      <div className="grid gap-6">
        <Message error={messages.error} success={messages.success} />
        <Card>
          <div className="mb-5">
            <p className="text-sm font-semibold text-slate-500">
              {ui.newAccess}
            </p>
            <h2 className="mt-1 text-xl font-bold">{ui.inviteEmployee}</h2>
          </div>
          <form
            action={createInviteAction}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end"
          >
            <Field label={`${ui.name} (${ui.optional})`}>
              <Input name="name" />
            </Field>
            <Field label={ui.email}>
              <Input name="email" type="email" required />
            </Field>
            <Field label={ui.role}>
              <Select name="role" defaultValue={Role.EMPLOYEE}>
                <option value={Role.EMPLOYEE}>{ui.employees}</option>
                {actor.role === Role.OWNER ? (
                  <option value={Role.ADMIN}>Admin</option>
                ) : null}
              </Select>
            </Field>
            <Field label={ui.weeklyTarget}>
              <Input
                name="weeklyTargetHours"
                type="number"
                min={0}
                max={168}
                step={0.25}
                defaultValue={40}
                required
              />
            </Field>
            <Button type="submit">{ui.invite}</Button>
            <fieldset className="md:col-span-2 xl:col-span-5">
              <legend className="text-sm font-medium text-slate-700">
                {ui.employeeAvailability}
              </legend>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                {ui.availabilityHint}
              </p>
              <WeekdaySelector
                name="availableWeekdays"
                selected={actor.organization.workingDays}
                allowed={actor.organization.workingDays}
                messages={ui}
              />
            </fieldset>
          </form>
        </Card>

        {invites.length > 0 ? (
          <Card>
            <h2 className="text-lg font-bold">{ui.openInvites}</h2>
            <div className="mt-4 divide-y">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{invite.name || invite.email}</p>
                    <p className="text-sm text-slate-500">{invite.email}</p>
                  </div>
                  <div className="text-right text-sm text-slate-500">
                    <p>{invite.role}</p>
                    <p>
                      {ui.validUntil}{" "}
                      {format(invite.expiresAt, "P", {
                        locale: dateLocale,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="overflow-hidden p-0">
          <div className="border-b p-5">
            <h2 className="text-xl font-bold">Team</h2>
            <p className="mt-1 text-sm text-slate-500">
              {members.length}{" "}
              {members.length === 1 ? ui.member : ui.members}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{ui.name}</th>
                  <th className="px-5 py-3">{ui.role}</th>
                  <th className="px-5 py-3">{ui.weeklyTarget}</th>
                  <th className="px-5 py-3">{ui.employeeAvailability}</th>
                  <th className="px-5 py-3">{ui.status}</th>
                  <th className="px-5 py-3 text-right">{ui.save}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => {
                  const protectedOwner = member.role === Role.OWNER;
                  const adminRestricted =
                    actor.role === Role.ADMIN && member.role === Role.ADMIN;
                  return (
                    <tr key={member.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold">{member.user.name}</p>
                        <p className="text-slate-500">{member.user.email}</p>
                      </td>
                      {protectedOwner || adminRestricted ? (
                        <>
                          <td className="px-5 py-4">{member.role}</td>
                          <td className="px-5 py-4">
                            {member.weeklyTargetMinutes / 60} h
                          </td>
                          <td className="px-5 py-4">
                            <WeekdaySelector
                              name="availableWeekdays"
                              selected={member.availableWeekdays}
                              messages={ui}
                              disabled
                            />
                          </td>
                          <td className="px-5 py-4">
                            {member.isActive ? ui.active : ui.inactive}
                          </td>
                          <td className="px-5 py-4 text-right text-slate-400">
                            {ui.protected}
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={5} className="px-5 py-3">
                            <form
                              action={updateMembershipAction}
                              className="grid grid-cols-[9rem_8rem_1fr_8rem_auto] items-center gap-3"
                            >
                              <input
                                type="hidden"
                                name="membershipId"
                                value={member.id}
                              />
                              <Select name="role" defaultValue={member.role}>
                                <option value={Role.EMPLOYEE}>EMPLOYEE</option>
                                {actor.role === Role.OWNER ? (
                                  <option value={Role.ADMIN}>ADMIN</option>
                                ) : null}
                              </Select>
                              <Input
                                name="weeklyTargetHours"
                                type="number"
                                min={0}
                                max={168}
                                step={0.25}
                                defaultValue={member.weeklyTargetMinutes / 60}
                                aria-label={ui.weeklyTarget}
                              />
                              <WeekdaySelector
                                name="availableWeekdays"
                                selected={member.availableWeekdays}
                                allowed={actor.organization.workingDays}
                                messages={ui}
                              />
                              <Select
                                name="isActive"
                                defaultValue={String(member.isActive)}
                              >
                                <option value="true">{ui.active}</option>
                                <option value="false">{ui.inactive}</option>
                              </Select>
                              <Button type="submit">{ui.save}</Button>
                            </form>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
