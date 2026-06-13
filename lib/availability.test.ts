import { describe, expect, it } from "vitest";
import {
  getShiftWeekday,
  hasShiftOverlap,
  isAvailableOnShiftDay,
} from "./availability";

describe("availability", () => {
  it("uses the organization's local weekday", () => {
    expect(
      getShiftWeekday(
        new Date("2026-06-14T22:30:00.000Z"),
        "Europe/Berlin",
      ),
    ).toBe(1);
  });

  it("requires both company and employee availability", () => {
    const startTime = new Date("2026-06-15T08:00:00.000Z");
    expect(
      isAvailableOnShiftDay({
        startTime,
        timeZone: "UTC",
        organizationWorkingDays: [1, 2, 3, 4, 5],
        memberAvailableWeekdays: [1, 3, 5],
      }),
    ).toBe(true);
    expect(
      isAvailableOnShiftDay({
        startTime,
        timeZone: "UTC",
        organizationWorkingDays: [1, 2, 3, 4, 5],
        memberAvailableWeekdays: [2, 3, 4],
      }),
    ).toBe(false);
  });

  it("detects overlapping shifts but allows adjacent shifts", () => {
    const shifts = [
      {
        startTime: new Date("2026-06-15T08:00:00.000Z"),
        endTime: new Date("2026-06-15T12:00:00.000Z"),
      },
    ];
    expect(
      hasShiftOverlap(
        shifts,
        new Date("2026-06-15T11:00:00.000Z"),
        new Date("2026-06-15T14:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      hasShiftOverlap(
        shifts,
        new Date("2026-06-15T12:00:00.000Z"),
        new Date("2026-06-15T14:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
