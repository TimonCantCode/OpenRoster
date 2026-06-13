import { describe, expect, it } from "vitest";
import {
  getTemplateDuration,
  getTemplateOccurrence,
  minutesToClock,
} from "./shift-templates";

describe("shift templates", () => {
  it("calculates a daytime shift duration", () => {
    expect(getTemplateDuration("08:00", "16:30")).toBe(510);
  });

  it("calculates an overnight shift duration", () => {
    expect(getTemplateDuration("22:00", "06:00")).toBe(480);
  });

  it("creates an overnight occurrence in the organization timezone", () => {
    const occurrence = getTemplateOccurrence({
      date: "2026-06-15",
      startMinutes: 22 * 60,
      durationMinutes: 8 * 60,
      timeZone: "Europe/Berlin",
    });

    expect(occurrence.startTime.toISOString()).toBe("2026-06-15T20:00:00.000Z");
    expect(occurrence.endTime.toISOString()).toBe("2026-06-16T04:00:00.000Z");
  });

  it("formats times after midnight", () => {
    expect(minutesToClock(30 * 60)).toBe("06:00");
  });
});
