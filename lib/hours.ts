import {
  differenceInMinutes,
} from "date-fns";

export type ShiftForHours = {
  startTime: Date;
  endTime: Date;
  breakMinutes: number;
};

export function getShiftMinutes(shift: ShiftForHours) {
  return Math.max(
    0,
    differenceInMinutes(shift.endTime, shift.startTime) - shift.breakMinutes,
  );
}

export function calculateWorkedMinutes(
  shifts: ShiftForHours[],
  adjustmentMinutes = 0,
) {
  return (
    shifts.reduce((total, shift) => total + getShiftMinutes(shift), 0) +
    adjustmentMinutes
  );
}

export function calculateTargetMinutes(
  weeklyTargetMinutes: number,
  from: Date,
  to: Date,
) {
  const elapsedMinutes = Math.max(0, differenceInMinutes(to, from));
  return Math.round((weeklyTargetMinutes / (7 * 24 * 60)) * elapsedMinutes);
}

export function calculateBalance(params: {
  shifts: ShiftForHours[];
  adjustmentMinutes: number;
  weeklyTargetMinutes: number;
  from: Date;
  to: Date;
}) {
  const workedMinutes = calculateWorkedMinutes(
    params.shifts,
    params.adjustmentMinutes,
  );
  const targetMinutes = calculateTargetMinutes(
    params.weeklyTargetMinutes,
    params.from,
    params.to,
  );

  return {
    workedMinutes,
    targetMinutes,
    balanceMinutes: workedMinutes - targetMinutes,
  };
}
