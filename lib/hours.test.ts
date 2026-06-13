import { describe, expect, it } from "vitest";
import {
  calculateBalance,
  calculateTargetMinutes,
  getShiftMinutes,
} from "./hours";

describe("hours calculation", () => {
  it("subtracts breaks from a shift", () => {
    expect(
      getShiftMinutes({
        startTime: new Date("2026-06-01T08:00:00Z"),
        endTime: new Date("2026-06-01T16:30:00Z"),
        breakMinutes: 30,
      }),
    ).toBe(480);
  });

  it("calculates 06:00 to 14:30 with a 30 minute break as 8 hours", () => {
    expect(
      getShiftMinutes({
        startTime: new Date("2026-06-01T06:00:00Z"),
        endTime: new Date("2026-06-01T14:30:00Z"),
        breakMinutes: 30,
      }),
    ).toBe(480);
  });

  it("calculates target minutes proportionally over elapsed time", () => {
    expect(
      calculateTargetMinutes(
        2400,
        new Date("2026-06-01T00:00:00Z"),
        new Date("2026-06-08T00:00:00Z"),
      ),
    ).toBe(2400);
  });

  it("starts a new membership at zero target minutes", () => {
    const createdAt = new Date("2026-06-13T10:00:00Z");
    expect(calculateTargetMinutes(2400, createdAt, createdAt)).toBe(0);
  });

  it("includes manual adjustments in the balance", () => {
    expect(
      calculateBalance({
        shifts: [
          {
            startTime: new Date("2026-06-01T08:00:00Z"),
            endTime: new Date("2026-06-01T16:00:00Z"),
            breakMinutes: 0,
          },
        ],
        adjustmentMinutes: 60,
        weeklyTargetMinutes: 540,
        from: new Date("2026-06-01T00:00:00Z"),
        to: new Date("2026-06-08T00:00:00Z"),
      }).balanceMinutes,
    ).toBe(0);
  });
});
