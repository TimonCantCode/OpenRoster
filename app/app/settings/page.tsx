import { Language, Role } from "@prisma/client";
import { format } from "date-fns";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import { WeekdaySelector } from "@/components/weekday-selector";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDateLocale, getMessages } from "@/lib/i18n";
import { updateOrganizationAction } from "@/server/actions/organizations";
import {
  updateLanguageAction,
  updateNotificationPreferencesAction,
} from "@/server/actions/preferences";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const actor = await requireMembership();
  const query = await searchParams;
  const canManageOrganization = actor.role === Role.OWNER;
  const canSeeAudit = actor.role === Role.OWNER || actor.role === Role.ADMIN;
  const messages = getMessages(actor.user.language);
  const dateLocale = getDateLocale(actor.user.language);
  const auditLogs = canSeeAudit
    ? await prisma.auditLog.findMany({
        where: { organizationId: actor.organizationId },
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  return (
    <>
      <PageHeading
        title={messages.settings}
        description={messages.settingsDescription}
      />
      <div className="grid gap-6">
        <Message error={query.error} success={query.success} />
        <Card>
          <h2 className="text-xl font-bold">{messages.profile}</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">{messages.name}</dt>
              <dd className="mt-1 font-semibold">{actor.user.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{messages.email}</dt>
              <dd className="mt-1 font-semibold">{actor.user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{messages.role}</dt>
              <dd className="mt-1 font-semibold">{actor.role}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="mb-5">
            <h2 className="text-xl font-bold">{messages.language}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {messages.languageHint}
            </p>
          </div>
          <form
            action={updateLanguageAction}
            className="flex max-w-md items-end gap-3"
          >
            <label className="grid flex-1 gap-1.5 text-sm font-medium text-slate-700">
              <span>{messages.language}</span>
              <select
                name="language"
                defaultValue={actor.user.language}
                className="min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm"
              >
                <option value={Language.EN}>{messages.english}</option>
                <option value={Language.DE}>{messages.german}</option>
              </select>
            </label>
            <Button type="submit">{messages.save}</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-5">
            <h2 className="text-xl font-bold">
              {messages.notifications}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {messages.notificationsHint}
            </p>
          </div>
          <form
            action={updateNotificationPreferencesAction}
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="notifyShiftChanges"
                value="true"
                defaultChecked={actor.notifyShiftChanges}
                className="size-4 accent-[#136f63]"
              />
              {messages.notifyShiftChanges}
            </label>
            <Button type="submit">{messages.save}</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-5">
            <h2 className="text-xl font-bold">{messages.organization}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {messages.organizationHint}
            </p>
          </div>
          {canManageOrganization ? (
            <form
              action={updateOrganizationAction}
              className="grid max-w-4xl gap-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end"
            >
              <Field label={messages.name}>
                <Input
                  name="name"
                  defaultValue={actor.organization.name}
                  required
                />
              </Field>
              <Field label={messages.timeZone}>
                <Input
                  name="timeZone"
                  defaultValue={actor.organization.timeZone}
                  placeholder="Europe/Berlin"
                  required
                />
              </Field>
              <Field label={messages.maxMembersPerShift}>
                <Input
                  name="maxMembersPerShift"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={actor.organization.maxMembersPerShift}
                  required
                />
              </Field>
              <Button type="submit">{messages.save}</Button>
              <fieldset className="sm:col-span-4">
                <legend className="text-sm font-medium text-slate-700">
                  {messages.companyWorkingDays}
                </legend>
                <p className="mb-3 mt-1 text-xs text-slate-500">
                  {messages.companyWorkingDaysHint}
                </p>
                <WeekdaySelector
                  name="workingDays"
                  selected={actor.organization.workingDays}
                  messages={messages}
                />
              </fieldset>
              <fieldset className="grid gap-3 sm:col-span-4">
                <legend className="text-sm font-medium text-slate-700">
                  {messages.scheduleFeatures}
                </legend>
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    name="allowOpenShifts"
                    value="true"
                    defaultChecked={actor.organization.allowOpenShifts}
                    className="size-4 accent-[#136f63]"
                  />
                  {messages.allowOpenShifts}
                </label>
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    name="allowShiftSwaps"
                    value="true"
                    defaultChecked={actor.organization.allowShiftSwaps}
                    className="size-4 accent-[#136f63]"
                  />
                  {messages.allowShiftSwaps}
                </label>
              </fieldset>
            </form>
          ) : (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="text-slate-500">{messages.name}:</span>{" "}
                <strong>{actor.organization.name}</strong>
              </p>
              <p>
                <span className="text-slate-500">{messages.timeZone}:</span>{" "}
                <strong>{actor.organization.timeZone}</strong>
              </p>
              <p>
                <span className="text-slate-500">
                  {messages.maxMembersPerShift}:
                </span>{" "}
                <strong>{actor.organization.maxMembersPerShift}</strong>
              </p>
              <p>
                <span className="text-slate-500">
                  {messages.allowOpenShifts}:
                </span>{" "}
                <strong>
                  {actor.organization.allowOpenShifts
                    ? messages.active
                    : messages.inactive}
                </strong>
              </p>
              <p>
                <span className="text-slate-500">
                  {messages.allowShiftSwaps}:
                </span>{" "}
                <strong>
                  {actor.organization.allowShiftSwaps
                    ? messages.active
                    : messages.inactive}
                </strong>
              </p>
              <div className="sm:col-span-2">
                <p className="mb-2 text-slate-500">
                  {messages.companyWorkingDays}
                </p>
                <WeekdaySelector
                  name="workingDays"
                  selected={actor.organization.workingDays}
                  messages={messages}
                  disabled
                />
              </div>
            </div>
          )}
        </Card>

        {canSeeAudit ? (
          <Card>
            <h2 className="text-xl font-bold">{messages.auditLog}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {messages.auditHint}
            </p>
            <div className="mt-5 divide-y">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-slate-500">{messages.noEntries}</p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium">{log.action}</p>
                      <p className="text-sm text-slate-500">
                        {log.actor?.name ?? "System"} · {log.entityType}
                      </p>
                    </div>
                    <time className="text-sm text-slate-500">
                      {format(log.createdAt, "Pp", { locale: dateLocale })}
                    </time>
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
