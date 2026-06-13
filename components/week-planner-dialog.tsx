"use client";

import { addDays, format, getISODay, parseISO } from "date-fns";
import {
  CalendarDays,
  CalendarPlus,
  List,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { buttonClass, secondaryButtonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import type { AppMessages } from "@/lib/i18n";
import {
  getTemplateDuration,
  minutesToClock,
} from "@/lib/shift-templates";
import { planWeekAction } from "@/server/actions/shift-templates";

type WeekOption = { value: string; label: string };
type TemplateOption = {
  id: string;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  breakMinutes: number;
  location: string | null;
};
type MemberOption = {
  id: string;
  name: string;
  role: string;
  weeklyTargetMinutes: number;
  availableWeekdays: number[];
};
type ExistingShift = {
  id: string;
  templateId: string | null;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  location: string | null;
  status: "DRAFT" | "PUBLISHED";
  membershipIds: string[];
};
type PlannedShift = ExistingShift & {
  key: string;
  source: "existing" | "standard" | "custom";
};

export function WeekPlannerDialog({
  weeks,
  defaultWeekStart,
  templates,
  members,
  existingShifts,
  workingDays,
  maxMembersPerShift,
  messages,
}: {
  weeks: WeekOption[];
  defaultWeekStart: string;
  templates: TemplateOption[];
  members: MemberOption[];
  existingShifts: ExistingShift[];
  workingDays: number[];
  maxMembersPerShift: number;
  messages: AppMessages;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [plannedShifts, setPlannedShifts] = useState<PlannedShift[]>(() =>
    buildWeek(defaultWeekStart, templates, existingShifts, workingDays),
  );
  const [selectedShiftKey, setSelectedShiftKey] = useState<string | null>(null);
  const [customError, setCustomError] = useState("");
  const [custom, setCustom] = useState({
    date: firstWorkingDate(defaultWeekStart, workingDays),
    title: "",
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 30,
    location: "",
  });

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(parseISO(weekStart), index);
        return {
          weekday: index + 1,
          date: format(date, "yyyy-MM-dd"),
          dateLabel: format(date, "dd.MM."),
        };
      }),
    [weekStart],
  );
  const selectedShift =
    plannedShifts.find((shift) => shift.key === selectedShiftKey) ?? null;
  const memberTotals = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.id,
          plannedShifts.reduce(
            (total, shift) =>
              total +
              (shift.membershipIds.includes(member.id)
                ? getPlannedShiftMinutes(shift)
                : 0),
            0,
          ),
        ]),
      ),
    [members, plannedShifts],
  );
  const openShiftCount = plannedShifts.filter(
    (shift) => shift.membershipIds.length < maxMembersPerShift,
  ).length;

  function openAssignment(shift: PlannedShift) {
    if (
      shift.membershipIds.length >= maxMembersPerShift &&
      !window.confirm(messages.changeFullShiftConfirm)
    ) {
      return;
    }
    setSelectedShiftKey(shift.key);
  }

  function changeWeek(nextWeekStart: string) {
    setWeekStart(nextWeekStart);
    setPlannedShifts(
      buildWeek(nextWeekStart, templates, existingShifts, workingDays),
    );
    setSelectedShiftKey(null);
    setCustom((current) => ({
      ...current,
      date: firstWorkingDate(nextWeekStart, workingDays),
    }));
  }

  function toggleAssignment(memberId: string) {
    if (!selectedShift) return;
    setPlannedShifts((current) =>
      current.map((shift) => {
        if (shift.key !== selectedShift.key) return shift;
        if (shift.membershipIds.includes(memberId)) {
          return {
            ...shift,
            membershipIds: shift.membershipIds.filter((id) => id !== memberId),
          };
        }
        if (shift.membershipIds.length >= maxMembersPerShift) {
          return maxMembersPerShift === 1
            ? { ...shift, membershipIds: [memberId] }
            : shift;
        }
        return { ...shift, membershipIds: [...shift.membershipIds, memberId] };
      }),
    );
  }

  function addCustomShift() {
    if (
      custom.title.trim().length < 2 ||
      !workingDays.includes(getISODay(parseISO(custom.date))) ||
      custom.breakMinutes >=
        getTemplateDuration(custom.startTime, custom.endTime)
    ) {
      setCustomError(messages.customShiftInvalid);
      return;
    }
    setCustomError("");
    setPlannedShifts((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        id: "",
        templateId: null,
        date: custom.date,
        title: custom.title.trim(),
        startTime: custom.startTime,
        endTime: custom.endTime,
        breakMinutes: custom.breakMinutes,
        location: custom.location.trim() || null,
        status: "DRAFT",
        membershipIds: [],
        source: "custom",
      },
    ]);
    setCustom((current) => ({ ...current, title: "", location: "" }));
  }

  function canAssign(member: MemberOption, shift: PlannedShift) {
    const weekday = getISODay(parseISO(shift.date));
    if (!member.availableWeekdays.includes(weekday)) {
      return { allowed: false, reason: messages.notAvailable };
    }
    const conflict = plannedShifts.some(
      (other) =>
        other.key !== shift.key &&
        other.membershipIds.includes(member.id) &&
        shiftsOverlap(other, shift),
    );
    return conflict
      ? { allowed: false, reason: messages.shiftConflict }
      : { allowed: true, reason: "" };
  }

  function confirmPublish(event: React.MouseEvent<HTMLButtonElement>) {
    if (
      openShiftCount > 0 &&
      !window.confirm(
        messages.publishOpenShiftsWarning.replace(
          "{count}",
          String(openShiftCount),
        ),
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonClass}
      >
        <CalendarPlus className="mr-2 size-4" />
        {messages.planWeek}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[calc(100vh-2rem)] w-[min(82rem,calc(100%-2rem))] overflow-hidden rounded-2xl border bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45"
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
          <div>
            <h2 className="text-xl font-bold">{messages.planWeek}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {messages.automaticStandardsHint}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label={messages.cancel}
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          action={planWeekAction}
          className="flex max-h-[calc(100vh-8rem)] flex-col"
        >
          <input type="hidden" name="weekStart" value={weekStart} />
          <input
            type="hidden"
            name="plan"
            value={JSON.stringify({
              shifts: plannedShifts.map((shift) => ({
                shiftId: shift.id || undefined,
                templateId: shift.templateId || undefined,
                date: shift.date,
                title: shift.title,
                startTime: shift.startTime,
                endTime: shift.endTime,
                breakMinutes: shift.breakMinutes,
                location: shift.location || undefined,
                membershipIds: shift.membershipIds,
              })),
            })}
          />

          <div className="grid gap-5 overflow-y-auto p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-72 flex-1">
                <Field label={messages.calendarWeek}>
                  <Select
                  value={weekStart}
                    onChange={(event) => changeWeek(event.target.value)}
                  >
                    {weeks.map((week) => (
                      <option key={week.value} value={week.value}>
                        {week.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={view === "list" ? buttonClass : secondaryButtonClass}
                >
                  <List className="mr-2 size-4" />
                  {messages.listView}
                </button>
                <button
                  type="button"
                  onClick={() => setView("calendar")}
                  className={
                    view === "calendar" ? buttonClass : secondaryButtonClass
                  }
                >
                  <CalendarDays className="mr-2 size-4" />
                  {messages.calendarView}
                </button>
              </div>
            </div>

            {view === "calendar" ? (
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <div className="grid min-w-[1050px] grid-cols-7">
                  {weekDays.map((day) => (
                    <div
                      key={day.date}
                      className="min-h-72 min-w-0 border-r last:border-r-0"
                    >
                      <div className="border-b bg-slate-50 p-2 text-center">
                        <p className="text-xs font-semibold uppercase text-[#136f63]">
                          {messages.weekdaysShort[day.weekday - 1]}
                        </p>
                        <p className="text-sm font-bold">{day.dateLabel}</p>
                      </div>
                      <div className="grid gap-2 p-2">
                        {plannedShifts
                          .filter((shift) => shift.date === day.date)
                          .sort((a, b) =>
                            a.startTime.localeCompare(b.startTime),
                          )
                          .map((shift) => (
                            <PlannerShiftCard
                              key={shift.key}
                              shift={shift}
                              members={members}
                              full={
                                shift.membershipIds.length >= maxMembersPerShift
                              }
                              capacity={maxMembersPerShift}
                              messages={messages}
                              onClick={() => openAssignment(shift)}
                              onDelete={
                                shift.source === "custom"
                                  ? () =>
                                      setPlannedShifts((current) =>
                                        current.filter(
                                          (item) => item.key !== shift.key,
                                        ),
                                      )
                                  : undefined
                              }
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="divide-y rounded-2xl border bg-white">
                {plannedShifts
                  .slice()
                  .sort(
                    (a, b) =>
                      a.date.localeCompare(b.date) ||
                      a.startTime.localeCompare(b.startTime),
                  )
                  .map((shift) => (
                    <PlannerShiftCard
                      key={shift.key}
                      shift={shift}
                      members={members}
                      full={shift.membershipIds.length >= maxMembersPerShift}
                      capacity={maxMembersPerShift}
                      messages={messages}
                      list
                      onClick={() => openAssignment(shift)}
                      onDelete={
                        shift.source === "custom"
                          ? () =>
                              setPlannedShifts((current) =>
                                current.filter((item) => item.key !== shift.key),
                              )
                          : undefined
                      }
                    />
                  ))}
              </div>
            )}

            {selectedShift ? (
              <section className="rounded-2xl border-2 border-[#136f63]/25 bg-emerald-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">
                      {messages.assignEmployees}: {selectedShift.title}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {selectedShift.date} · {selectedShift.startTime}-
                      {selectedShift.endTime}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedShiftKey(null)}
                    className="grid size-8 place-items-center rounded-lg hover:bg-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {members.map((member) => {
                    const availability = canAssign(member, selectedShift);
                    const selected = selectedShift.membershipIds.includes(
                      member.id,
                    );
                    const minutesWithoutShift =
                      (memberTotals.get(member.id) ?? 0) -
                      (selected ? getPlannedShiftMinutes(selectedShift) : 0);
                    const projectedMinutes =
                      minutesWithoutShift + getPlannedShiftMinutes(selectedShift);
                    const overTarget =
                      projectedMinutes > member.weeklyTargetMinutes;
                    return (
                      <label
                        key={member.id}
                        className={`flex items-start gap-3 rounded-xl border bg-white p-3 ${
                          !availability.allowed && !selected
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer hover:border-[#136f63]"
                        }`}
                      >
                        <input
                          type={
                            maxMembersPerShift === 1 ? "radio" : "checkbox"
                          }
                          checked={selected}
                          disabled={!availability.allowed && !selected}
                          onChange={() => toggleAssignment(member.id)}
                          className="mt-0.5 size-4 accent-[#136f63]"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{member.name}</span>
                          <span
                            className={`block text-xs ${
                              overTarget ? "font-semibold text-amber-700" : "text-slate-500"
                            }`}
                          >
                            {formatMinutes(projectedMinutes)} /{" "}
                            {formatMinutes(member.weeklyTargetMinutes)}
                            {overTarget ? ` · ${messages.overTarget}` : ""}
                          </span>
                          {!availability.allowed ? (
                            <span className="block text-xs text-red-700">
                              {availability.reason}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border bg-slate-50/60 p-4">
              <h3 className="font-bold">{messages.addCustomShift}</h3>
              {customError ? (
                <p className="mt-1 text-sm text-red-700">{customError}</p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                <Field label={messages.title}>
                  <Input
                    value={custom.title}
                    onChange={(event) =>
                      setCustom((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label={messages.day}>
                  <Select
                    value={custom.date}
                    onChange={(event) =>
                      setCustom((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                  >
                    {weekDays
                      .filter((day) => workingDays.includes(day.weekday))
                      .map((day) => (
                        <option key={day.date} value={day.date}>
                          {messages.weekdaysShort[day.weekday - 1]}{" "}
                          {day.dateLabel}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label={messages.start}>
                  <Input
                    type="time"
                    value={custom.startTime}
                    onChange={(event) =>
                      setCustom((current) => ({
                        ...current,
                        startTime: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label={messages.end}>
                  <Input
                    type="time"
                    value={custom.endTime}
                    onChange={(event) =>
                      setCustom((current) => ({
                        ...current,
                        endTime: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label={messages.breakMinutes}>
                  <Input
                    type="number"
                    min={0}
                    value={custom.breakMinutes}
                    onChange={(event) =>
                      setCustom((current) => ({
                        ...current,
                        breakMinutes: Number(event.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label={`${messages.location} (${messages.optional})`}>
                  <Input
                    value={custom.location}
                    onChange={(event) =>
                      setCustom((current) => ({
                        ...current,
                        location: event.target.value,
                      }))
                    }
                  />
                </Field>
                <button
                  type="button"
                  onClick={addCustomShift}
                  className={`${buttonClass} self-end`}
                >
                  <Plus className="mr-2 size-4" />
                  {messages.add}
                </button>
              </div>
            </section>

            <section>
              <h3 className="font-bold">{messages.employeeHoursOverview}</h3>
              <div className="mt-3 overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{messages.employees}</th>
                      <th className="px-4 py-3">{messages.planned}</th>
                      <th className="px-4 py-3">{messages.target}</th>
                      <th className="px-4 py-3">{messages.balance}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-white">
                    {members.map((member) => {
                      const minutes = memberTotals.get(member.id) ?? 0;
                      const difference =
                        minutes - member.weeklyTargetMinutes;
                      return (
                        <tr key={member.id}>
                          <td className="px-4 py-3 font-medium">{member.name}</td>
                          <td className="px-4 py-3">{formatMinutes(minutes)}</td>
                          <td className="px-4 py-3">
                            {formatMinutes(member.weeklyTargetMinutes)}
                          </td>
                          <td
                            className={`px-4 py-3 font-semibold ${
                              difference > 0
                                ? "text-amber-700"
                                : difference === 0
                                  ? "text-emerald-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {difference > 0 ? "+" : ""}
                            {formatMinutes(difference)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-6 py-4">
            <p
              className={`text-sm ${
                openShiftCount > 0 ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {openShiftCount > 0
                ? messages.openShiftsCount.replace(
                    "{count}",
                    String(openShiftCount),
                  )
                : messages.allShiftsStaffed}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className={secondaryButtonClass}
              >
                {messages.cancel}
              </button>
              <button
                type="submit"
                name="intent"
                value="draft"
                className={secondaryButtonClass}
              >
                {messages.saveDraft}
              </button>
              <button
                type="submit"
                name="intent"
                value="publish"
                onClick={confirmPublish}
                className={buttonClass}
              >
                {messages.saveAndPublish}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

function PlannerShiftCard({
  shift,
  members,
  full,
  capacity,
  messages,
  list = false,
  onClick,
  onDelete,
}: {
  shift: PlannedShift;
  members: MemberOption[];
  full: boolean;
  capacity: number;
  messages: AppMessages;
  list?: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const names = shift.membershipIds
    .map((id) => members.find((member) => member.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  return (
    <div
      className={`relative cursor-pointer border transition hover:border-[#136f63] ${
        list
          ? "grid gap-2 px-4 py-3 sm:grid-cols-[7rem_8rem_1fr_auto] sm:items-center"
          : "min-w-0 rounded-xl p-2"
      } ${
        full
          ? "border-emerald-300 bg-emerald-100"
          : "border-amber-200 bg-amber-50"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick();
      }}
    >
      {list ? <span className="text-sm font-semibold">{shift.date}</span> : null}
      <span className="text-xs font-semibold text-[#136f63]">
        {shift.startTime}-{shift.endTime}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{shift.title}</p>
        <p className="truncate text-xs text-slate-500">
          {names || messages.unassigned}
        </p>
      </div>
      <span className="text-xs font-semibold">
        {shift.membershipIds.length}/{capacity}
      </span>
      {onDelete ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="absolute right-1 top-1 grid size-7 place-items-center rounded-lg text-red-700 hover:bg-white"
          aria-label={messages.delete}
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function buildWeek(
  weekStart: string,
  templates: TemplateOption[],
  existingShifts: ExistingShift[],
  workingDays: number[],
) {
  const endDate = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
  const existing = existingShifts
    .filter((shift) => shift.date >= weekStart && shift.date <= endDate)
    .map((shift) => ({
      ...shift,
      key: shift.id,
      source: "existing" as const,
    }));
  const existingStandards = new Set(
    existing
      .filter((shift) => shift.templateId)
      .map((shift) => `${shift.templateId}:${shift.date}`),
  );
  const standards = workingDays.flatMap((weekday) => {
    const date = format(addDays(parseISO(weekStart), weekday - 1), "yyyy-MM-dd");
    return templates
      .filter(
        (template) => !existingStandards.has(`${template.id}:${date}`),
      )
      .map((template) => ({
        key: `standard:${template.id}:${date}`,
        id: "",
        templateId: template.id,
        date,
        title: template.title,
        startTime: minutesToClock(template.startMinutes),
        endTime: minutesToClock(
          template.startMinutes + template.durationMinutes,
        ),
        breakMinutes: template.breakMinutes,
        location: template.location,
        status: "DRAFT" as const,
        membershipIds: [],
        source: "standard" as const,
      }));
  });
  return [...existing, ...standards];
}

function firstWorkingDate(weekStart: string, workingDays: number[]) {
  return format(
    addDays(parseISO(weekStart), Math.max(0, (workingDays[0] ?? 1) - 1)),
    "yyyy-MM-dd",
  );
}

function getPlannedShiftMinutes(shift: PlannedShift) {
  return Math.max(
    0,
    getTemplateDuration(shift.startTime, shift.endTime) - shift.breakMinutes,
  );
}

function shiftsOverlap(left: PlannedShift, right: PlannedShift) {
  const leftStart = new Date(`${left.date}T${left.startTime}:00`);
  const leftEnd = new Date(leftStart);
  leftEnd.setMinutes(leftEnd.getMinutes() + getTemplateDuration(left.startTime, left.endTime));
  const rightStart = new Date(`${right.date}T${right.startTime}:00`);
  const rightEnd = new Date(rightStart);
  rightEnd.setMinutes(
    rightEnd.getMinutes() +
      getTemplateDuration(right.startTime, right.endTime),
  );
  return leftStart < rightEnd && leftEnd > rightStart;
}

function formatMinutes(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}:${String(
    absolute % 60,
  ).padStart(2, "0")} h`;
}
