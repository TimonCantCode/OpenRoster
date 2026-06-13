import { describe, expect, it } from "vitest";
import { weekPlanSchema } from "./validators";

describe("week plan validation", () => {
  it("accepts standard, existing and custom shifts in one plan", () => {
    const result = weekPlanSchema.safeParse({
      shifts: [
        {
          templateId: "cmqc962ec0003n901rgd49vza",
          date: "2026-06-15",
          title: "Early shift",
          startTime: "06:00",
          endTime: "14:30",
          breakMinutes: 30,
          membershipIds: ["cmqcaas4o0028uq016c3ws83c"],
        },
        {
          shiftId: "cmqca9p8f0005uq01tjhvkeey",
          date: "2026-06-16",
          title: "Existing shift",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 30,
          membershipIds: [],
        },
        {
          date: "2026-06-17",
          title: "Custom shift",
          startTime: "12:00",
          endTime: "18:00",
          breakMinutes: 15,
          location: "Main office",
          membershipIds: [],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid custom shift times", () => {
    const result = weekPlanSchema.safeParse({
      shifts: [
        {
          date: "2026-06-17",
          title: "Custom shift",
          startTime: "25:00",
          endTime: "18:00",
          breakMinutes: 15,
          membershipIds: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
