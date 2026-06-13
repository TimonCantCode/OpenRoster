import type {
  Membership,
  ShiftTemplate,
  User,
} from "@prisma/client";
import { addMonths, format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import { WeekdaySelector } from "@/components/weekday-selector";
import type { AppMessages } from "@/lib/i18n";
import {
  minutesToClock,
} from "@/lib/shift-templates";
import {
  createRecurringShiftsAction,
  createShiftTemplateAction,
  deleteShiftTemplateAction,
} from "@/server/actions/shift-templates";

type MemberOption = Membership & { user: User };

export function StandardShiftManager({
  templates,
  members,
  error,
  success,
  messages,
  workingDays,
}: {
  templates: ShiftTemplate[];
  members: MemberOption[];
  error?: string;
  success?: string;
  messages: AppMessages;
  workingDays: number[];
}) {
  const today = new Date();

  return (
    <div className="grid gap-6">
      <Message error={error} success={success} />

      <Card>
        <div className="mb-5">
          <p className="text-sm font-semibold text-slate-500">
            {messages.template}
          </p>
          <h2 className="mt-1 text-xl font-bold">{messages.createTemplate}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {messages.templateHint}
          </p>
        </div>
        <form
          action={createShiftTemplateAction}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Field label={messages.title}>
              <Input
                name="title"
                placeholder={messages.exampleEarlyShift}
                required
              />
            </Field>
          </div>
          <Field label={messages.start}>
            <Input name="startTime" type="time" required />
          </Field>
          <Field label={messages.end}>
            <Input name="endTime" type="time" required />
          </Field>
          <Field label={messages.breakMinutes}>
            <Input
              name="breakMinutes"
              type="number"
              min={0}
              max={1440}
              defaultValue={0}
              required
            />
          </Field>
          <Field label={`${messages.location} (${messages.optional})`}>
            <Input name="location" />
          </Field>
          <div className="sm:col-span-2">
            <Field label={`${messages.notes} (${messages.optional})`}>
              <Textarea name="notes" rows={3} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">{messages.saveTemplate}</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-5">
          <p className="text-sm font-semibold text-slate-500">
            {messages.series}
          </p>
          <h2 className="mt-1 text-xl font-bold">{messages.scheduleTemplates}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {messages.seriesHint}
          </p>
        </div>
        {templates.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-sm text-slate-500">
            {messages.createTemplateFirst}
          </p>
        ) : (
          <form
            action={createRecurringShiftsAction}
            className="grid gap-5 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <Field label={messages.standardShift}>
                <Select name="templateId" required>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title} · {minutesToClock(template.startMinutes)}–
                      {minutesToClock(
                        template.startMinutes + template.durationMinutes,
                      )}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={messages.from}>
              <Input
                name="startDate"
                type="date"
                defaultValue={format(today, "yyyy-MM-dd")}
                required
              />
            </Field>
            <Field label={messages.until}>
              <Input
                name="endDate"
                type="date"
                defaultValue={format(addMonths(today, 1), "yyyy-MM-dd")}
                required
              />
            </Field>

            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-slate-700">
                {messages.repeatOn}
              </legend>
              <div className="mt-2">
                <WeekdaySelector
                  name="weekdays"
                  selected={workingDays}
                  allowed={workingDays}
                  messages={messages}
                />
              </div>
            </fieldset>

            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-slate-700">
                {messages.assignEmployees}
              </legend>
              <div className="mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
                {members.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      name="membershipIds"
                      value={member.id}
                      className="size-4 accent-[#136f63]"
                    />
                    <span>
                      <span className="block font-medium">
                        {member.user.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {member.role} · {member.weeklyTargetMinutes / 60} h
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Button type="submit">{messages.createSeries}</Button>
            </div>
          </form>
        )}
      </Card>

      {templates.length > 0 ? (
        <Card>
          <h2 className="text-xl font-bold">{messages.savedTemplates}</h2>
          <div className="mt-4 divide-y">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-semibold">{template.title}</p>
                  <p className="text-sm text-slate-500">
                    {minutesToClock(template.startMinutes)}–
                    {minutesToClock(
                      template.startMinutes + template.durationMinutes,
                    )}{" "}
                    · {template.breakMinutes} {messages.breakShort}
                    {template.location ? ` · ${template.location}` : ""}
                  </p>
                </div>
                <form action={deleteShiftTemplateAction}>
                  <input
                    type="hidden"
                    name="templateId"
                    value={template.id}
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="size-4" />
                    {messages.delete}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
