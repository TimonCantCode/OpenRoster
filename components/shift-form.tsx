import type { Membership, Shift, User } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { Button, secondaryButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import type { AppMessages } from "@/lib/i18n";

type MemberOption = Membership & { user: User };
type EditableShift = Shift & {
  assignments: Array<{ membershipId: string }>;
};

export function ShiftForm({
  action,
  members,
  timeZone,
  shift,
  error,
  messages,
  allowOpenShifts = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  members: MemberOption[];
  timeZone: string;
  shift?: EditableShift;
  error?: string;
  messages: AppMessages;
  allowOpenShifts?: boolean;
}) {
  const assignedIds = new Set(
    shift?.assignments.map((assignment) => assignment.membershipId) ?? [],
  );
  const startDefault = shift
    ? formatInTimeZone(shift.startTime, timeZone, "yyyy-MM-dd'T'HH:mm")
    : "";
  const endDefault = shift
    ? formatInTimeZone(shift.endTime, timeZone, "yyyy-MM-dd'T'HH:mm")
    : "";

  return (
    <Card className="max-w-3xl">
      <form action={action} className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Message error={error} />
        </div>
        {shift ? <input type="hidden" name="shiftId" value={shift.id} /> : null}
        <div className="sm:col-span-2">
          <Field label={messages.title}>
            <Input
              name="title"
              defaultValue={shift?.title}
              placeholder={messages.exampleEarlyShift}
              required
            />
          </Field>
        </div>
        <Field label={messages.start}>
          <Input
            name="startTime"
            type="datetime-local"
            defaultValue={startDefault}
            required
          />
        </Field>
        <Field label={messages.end}>
          <Input
            name="endTime"
            type="datetime-local"
            defaultValue={endDefault}
            required
          />
        </Field>
        <Field label={messages.breakMinutes}>
          <Input
            name="breakMinutes"
            type="number"
            min={0}
            max={1440}
            defaultValue={shift?.breakMinutes ?? 0}
            required
          />
        </Field>
        {allowOpenShifts ? (
          <label className="flex min-h-11 items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="isOpen"
              value="true"
              defaultChecked={shift?.isOpen ?? false}
              className="size-4 accent-[#136f63]"
            />
            {messages.openShift}
          </label>
        ) : null}
        <Field label={`${messages.location} (${messages.optional})`}>
          <Input name="location" defaultValue={shift?.location ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={`${messages.notes} (${messages.optional})`}>
            <Textarea
              name="notes"
              rows={4}
              defaultValue={shift?.notes ?? ""}
            />
          </Field>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-slate-700">
            {messages.assignEmployees}
          </legend>
          <div className="mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
            {members.length === 0 ? (
              <p className="text-sm text-slate-500">
                {messages.noActiveEmployees}
              </p>
            ) : (
              members.map((member) => (
                <label
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    name="membershipIds"
                    value={member.id}
                    defaultChecked={assignedIds.has(member.id)}
                    className="size-4 accent-[#136f63]"
                  />
                  <span>
                    <span className="block font-medium">{member.user.name}</span>
                    <span className="text-xs text-slate-500">
                      {member.role} · {member.weeklyTargetMinutes / 60} h/
                      {messages.week}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit">
            {shift ? messages.saveChanges : messages.createShift}
          </Button>
          <Link href="/app/schedule" className={secondaryButtonClass}>
            {messages.cancel}
          </Link>
        </div>
      </form>
    </Card>
  );
}
