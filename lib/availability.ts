import { getISODay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function getShiftWeekday(startTime: Date, timeZone: string) {
  return getISODay(toZonedTime(startTime, timeZone));
}

export function isAvailableOnShiftDay(params: {
  startTime: Date;
  timeZone: string;
  organizationWorkingDays: number[];
  memberAvailableWeekdays: number[];
}) {
  const weekday = getShiftWeekday(params.startTime, params.timeZone);
  return (
    params.organizationWorkingDays.includes(weekday) &&
    params.memberAvailableWeekdays.includes(weekday)
  );
}

export function hasShiftOverlap(
  shifts: Array<{ startTime: Date; endTime: Date }>,
  startTime: Date,
  endTime: Date,
) {
  return shifts.some(
    (shift) => shift.startTime < endTime && shift.endTime > startTime,
  );
}
