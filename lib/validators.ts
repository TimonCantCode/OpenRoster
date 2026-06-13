import { Role } from "@prisma/client";
import { z } from "zod";

const weekdays = z
  .array(z.coerce.number().int().min(1).max(7))
  .min(1, "Select at least one weekday.")
  .transform((values) => [...new Set(values)].sort());

const password = z
  .string()
  .min(12, "The password must be at least 12 characters long.")
  .max(128, "The password is too long.");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email(),
  password,
  organizationName: z.string().trim().min(2).max(120),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(2).max(100),
  password,
});

export const inviteSchema = z.object({
  email: z.email(),
  name: z.string().trim().max(100).optional(),
  role: z.enum([Role.ADMIN, Role.EMPLOYEE]),
  weeklyTargetHours: z.coerce.number().min(0).max(168),
  availableWeekdays: weekdays,
});

export const membershipSchema = z.object({
  membershipId: z.string().cuid(),
  role: z.enum([Role.ADMIN, Role.EMPLOYEE]),
  weeklyTargetHours: z.coerce.number().min(0).max(168),
  isActive: z.enum(["true", "false"]),
  availableWeekdays: weekdays,
});

export const shiftSchema = z
  .object({
    shiftId: z.string().cuid().optional(),
    title: z.string().trim().min(2).max(120),
    startTime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid start time."),
    endTime: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid end time."),
    breakMinutes: z.coerce.number().int().min(0).max(1440),
    isOpen: z.enum(["true", "false"]).default("false"),
    location: z.string().trim().max(160).optional(),
    notes: z.string().trim().max(2000).optional(),
    membershipIds: z.array(z.string().cuid()).max(100),
  })
  .superRefine((value, context) => {
    if (value.endTime <= value.startTime) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "The end must be after the start.",
      });
      return;
    }

    const durationMinutes =
      (new Date(value.endTime).getTime() -
        new Date(value.startTime).getTime()) /
      60_000;
    if (value.breakMinutes >= durationMinutes) {
      context.addIssue({
        code: "custom",
        path: ["breakMinutes"],
        message: "The break must be shorter than the shift.",
      });
    }
  });

const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.");

export const shiftTemplateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  startTime: clockTime,
  endTime: clockTime,
  breakMinutes: z.coerce.number().int().min(0).max(1440),
  location: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const recurringShiftSchema = z
  .object({
    templateId: z.string().cuid(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    weekdays,
    membershipIds: z.array(z.string().cuid()).max(100),
  })
  .superRefine((value, context) => {
    const start = new Date(`${value.startDate}T00:00:00Z`);
    const end = new Date(`${value.endDate}T00:00:00Z`);
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (end < start) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date must be after the start date.",
      });
    } else if (days > 366) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A series may cover at most 12 months.",
      });
    }
  });

export const weekPlanSchema = z.object({
  shifts: z
    .array(
      z.object({
        shiftId: z.string().cuid().optional(),
        templateId: z.string().cuid().optional(),
        date: z.iso.date(),
        title: z.string().trim().min(2).max(120),
        startTime: clockTime,
        endTime: clockTime,
        breakMinutes: z.coerce.number().int().min(0).max(1440),
        location: z.string().trim().max(160).optional(),
        membershipIds: z.array(z.string().cuid()).max(100),
      }),
    )
    .max(100, "A weekly plan may contain at most 100 shifts."),
});

export const adjustmentSchema = z.object({
  membershipId: z.string().cuid(),
  minutes: z.coerce.number().int().min(-10080).max(10080).refine(Boolean, {
    message: "The adjustment cannot be 0 minutes.",
  }),
  reason: z.string().trim().min(3).max(300),
});

export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  workingDays: weekdays,
  maxMembersPerShift: z.coerce
    .number()
    .int()
    .min(1, "At least one employee must be allowed per shift.")
    .max(100, "At most 100 employees can be assigned per shift."),
  allowShiftSwaps: z.enum(["true", "false"]).default("false"),
  allowOpenShifts: z.enum(["true", "false"]).default("false"),
  timeZone: z.string().trim().refine(
    (value) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Enter a valid IANA time zone." },
  ),
});

export function firstValidationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check your input.";
}
