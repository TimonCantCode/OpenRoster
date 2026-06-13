import { addDays, format, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

export function clockToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getTemplateDuration(startTime: string, endTime: string) {
  const startMinutes = clockToMinutes(startTime);
  const endMinutes = clockToMinutes(endTime);
  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : endMinutes + 1440 - startMinutes;
}

export function minutesToClock(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`;
}

export function getTemplateOccurrence(params: {
  date: string;
  startMinutes: number;
  durationMinutes: number;
  timeZone: string;
}) {
  const endTotalMinutes = params.startMinutes + params.durationMinutes;
  const endDate = format(
    addDays(parseISO(params.date), Math.floor(endTotalMinutes / 1440)),
    "yyyy-MM-dd",
  );

  return {
    startTime: fromZonedTime(
      `${params.date}T${minutesToClock(params.startMinutes)}`,
      params.timeZone,
    ),
    endTime: fromZonedTime(
      `${endDate}T${minutesToClock(endTotalMinutes)}`,
      params.timeZone,
    ),
  };
}
