"use server";

import { Role, ShiftStatus } from "@prisma/client";
import {
  addDays,
  eachDayOfInterval,
  format,
  getISODay,
  parseISO,
} from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString } from "@/lib/action-utils";
import { requireMembership } from "@/lib/auth";
import { isAvailableOnShiftDay } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { notifyAssignedMembers } from "@/lib/shift-notifications";
import {
  clockToMinutes,
  getTemplateDuration,
  getTemplateOccurrence,
} from "@/lib/shift-templates";
import { optionalString } from "@/lib/utils";
import {
  firstValidationError,
  recurringShiftSchema,
  shiftTemplateSchema,
  weekPlanSchema,
} from "@/lib/validators";

function standardRedirect(type: "error" | "success", message: string): never {
  const params = new URLSearchParams({ mode: "standard", [type]: message });
  redirect(`/app/schedule/new?${params.toString()}`);
}

function plannerRedirect(
  weekStart: string,
  type: "error" | "success",
  message: string,
): never {
  const params = new URLSearchParams({
    week: weekStart,
    view: "calendar",
    [type]: message,
  });
  redirect(`/app/schedule?${params.toString()}`);
}

async function getAssignees(organizationId: string, membershipIds: string[]) {
  const uniqueIds = [...new Set(membershipIds)];
  const memberships = await prisma.membership.findMany({
    where: {
      id: { in: uniqueIds },
      organizationId,
      isActive: true,
    },
  });
  return memberships.length === uniqueIds.length ? memberships : null;
}

export async function createShiftTemplateAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const parsed = shiftTemplateSchema.safeParse({
    title: formString(formData, "title"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    breakMinutes: formString(formData, "breakMinutes"),
    location: optionalString(formData.get("location")) ?? undefined,
    notes: optionalString(formData.get("notes")) ?? undefined,
  });
  if (!parsed.success) {
    standardRedirect("error", firstValidationError(parsed.error));
  }

  const durationMinutes = getTemplateDuration(
    parsed.data.startTime,
    parsed.data.endTime,
  );
  if (parsed.data.breakMinutes >= durationMinutes) {
    standardRedirect("error", "The break must be shorter than the shift.");
  }

  await prisma.$transaction(async (tx) => {
    const template = await tx.shiftTemplate.create({
      data: {
        organizationId: actor.organizationId,
        title: parsed.data.title,
        startMinutes: clockToMinutes(parsed.data.startTime),
        durationMinutes,
        breakMinutes: parsed.data.breakMinutes,
        location: parsed.data.location,
        notes: parsed.data.notes,
        createdById: actor.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "shift-template.created",
        entityType: "ShiftTemplate",
        entityId: template.id,
      },
    });
  });

  revalidatePath("/app/schedule/new");
  standardRedirect("success", "Standard shift saved.");
}

export async function deleteShiftTemplateAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const templateId = formString(formData, "templateId");
  const template = await prisma.shiftTemplate.findFirst({
    where: { id: templateId, organizationId: actor.organizationId },
  });
  if (!template) {
    standardRedirect("error", "Standard shift not found.");
  }

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "shift-template.deleted",
        entityType: "ShiftTemplate",
        entityId: template.id,
        metadata: { title: template.title },
      },
    }),
    prisma.shiftTemplate.delete({ where: { id: template.id } }),
  ]);

  revalidatePath("/app/schedule/new");
  standardRedirect("success", "Standard shift deleted.");
}

export async function createRecurringShiftsAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const parsed = recurringShiftSchema.safeParse({
    templateId: formString(formData, "templateId"),
    startDate: formString(formData, "startDate"),
    endDate: formString(formData, "endDate"),
    weekdays: formData.getAll("weekdays").map(String),
    membershipIds: formData.getAll("membershipIds").map(String),
  });
  if (!parsed.success) {
    standardRedirect("error", firstValidationError(parsed.error));
  }

  const [template, assignees] = await Promise.all([
    prisma.shiftTemplate.findFirst({
      where: {
        id: parsed.data.templateId,
        organizationId: actor.organizationId,
      },
    }),
    getAssignees(actor.organizationId, parsed.data.membershipIds),
  ]);
  if (!template) {
    standardRedirect("error", "Standard shift not found.");
  }
  if (!assignees) {
    standardRedirect("error", "At least one assignment is invalid.");
  }
  if (assignees.length > actor.organization.maxMembersPerShift) {
    standardRedirect(
      "error",
      `This shift allows at most ${actor.organization.maxMembersPerShift} employee(s).`,
    );
  }

  const weekdays = new Set(parsed.data.weekdays);
  const occurrences = eachDayOfInterval({
    start: parseISO(parsed.data.startDate),
    end: parseISO(parsed.data.endDate),
  })
    .filter((date) => weekdays.has(getISODay(date)))
    .map((date) =>
      getTemplateOccurrence({
        date: format(date, "yyyy-MM-dd"),
        startMinutes: template.startMinutes,
        durationMinutes: template.durationMinutes,
        timeZone: actor.organization.timeZone,
      }),
    );

  if (occurrences.length === 0) {
    standardRedirect(
      "error",
      "None of the selected weekdays occur in the chosen date range.",
    );
  }
  const unavailable = occurrences.some((occurrence) =>
    assignees.some(
      (member) =>
        !isAvailableOnShiftDay({
          startTime: occurrence.startTime,
          timeZone: actor.organization.timeZone,
          organizationWorkingDays: actor.organization.workingDays,
          memberAvailableWeekdays: member.availableWeekdays,
        }),
    ),
  );
  if (unavailable) {
    standardRedirect(
      "error",
      "At least one employee is unavailable on a selected weekday.",
    );
  }
  const conflicts = await Promise.all(
    occurrences.map((occurrence) =>
      prisma.shiftAssignment.count({
        where: {
          membershipId: { in: assignees.map((member) => member.id) },
          shift: {
            startTime: { lt: occurrence.endTime },
            endTime: { gt: occurrence.startTime },
          },
        },
      }),
    ),
  );
  if (conflicts.some((count) => count > 0)) {
    standardRedirect(
      "error",
      "At least one employee already has an overlapping shift.",
    );
  }

  const existing = await prisma.shift.findMany({
    where: {
      organizationId: actor.organizationId,
      templateId: template.id,
      startTime: {
        in: occurrences.map((occurrence) => occurrence.startTime),
      },
    },
    select: { startTime: true },
  });
  const existingStarts = new Set(
    existing.map((shift) => shift.startTime.getTime()),
  );
  const newOccurrences = occurrences.filter(
    (occurrence) => !existingStarts.has(occurrence.startTime.getTime()),
  );

  if (newOccurrences.length === 0) {
    standardRedirect(
      "error",
      "All shifts for this template already exist in the selected range.",
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const occurrence of newOccurrences) {
      const shift = await tx.shift.create({
        data: {
          organizationId: actor.organizationId,
          templateId: template.id,
          title: template.title,
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
          breakMinutes: template.breakMinutes,
          location: template.location,
          notes: template.notes,
          createdById: actor.userId,
        },
      });
      if (assignees.length > 0) {
        await tx.shiftAssignment.createMany({
          data: assignees.map((member) => ({
            organizationId: actor.organizationId,
            shiftId: shift.id,
            membershipId: member.id,
          })),
        });
      }
    }
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "shift-series.created",
        entityType: "ShiftTemplate",
        entityId: template.id,
        metadata: {
          count: newOccurrences.length,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          weekdays: [...weekdays],
        },
      },
    });
  });

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  const skipped = occurrences.length - newOccurrences.length;
  standardRedirect(
    "success",
    `${newOccurrences.length} shifts created${
      skipped > 0 ? `, ${skipped} existing shifts skipped` : ""
    }.`,
  );
}

export async function planWeekAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const weekStart = formString(formData, "weekStart");
  const intent = formString(formData, "intent");
  const parsedWeekStart = parseISO(weekStart);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ||
    Number.isNaN(parsedWeekStart.getTime()) ||
    getISODay(parsedWeekStart) !== 1
  ) {
    plannerRedirect(format(new Date(), "yyyy-MM-dd"), "error", "Invalid week.");
  }
  if (intent !== "draft" && intent !== "publish") {
    plannerRedirect(weekStart, "error", "Invalid save action.");
  }

  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(formString(formData, "plan"));
  } catch {
    plannerRedirect(weekStart, "error", "The weekly plan is invalid.");
  }
  const parsedPlan = weekPlanSchema.safeParse(rawPlan);
  if (!parsedPlan.success) {
    plannerRedirect(
      weekStart,
      "error",
      firstValidationError(parsedPlan.error),
    );
  }

  const rangeStart = fromZonedTime(
    `${weekStart}T00:00`,
    actor.organization.timeZone,
  );
  const rangeEnd = fromZonedTime(
    `${format(addDays(parsedWeekStart, 7), "yyyy-MM-dd")}T00:00`,
    actor.organization.timeZone,
  );
  const templateIds = [
    ...new Set(
      parsedPlan.data.shifts
        .map((shift) => shift.templateId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const membershipIds = [
    ...new Set(
      parsedPlan.data.shifts.flatMap((shift) => shift.membershipIds),
    ),
  ];
  const [templates, assignees, existingShifts] = await Promise.all([
    prisma.shiftTemplate.findMany({
      where: {
        id: { in: templateIds },
        organizationId: actor.organizationId,
      },
    }),
    prisma.membership.findMany({
      where: {
        id: { in: membershipIds },
        organizationId: actor.organizationId,
        isActive: true,
      },
      include: {
        shiftAssignments: {
          where: {
            shift: {
              startTime: { lt: rangeEnd },
              endTime: { gt: rangeStart },
            },
          },
          include: { shift: true },
        },
      },
    }),
    prisma.shift.findMany({
      where: {
        organizationId: actor.organizationId,
        startTime: { gte: rangeStart, lt: rangeEnd },
      },
      include: {
        assignments: true,
      },
    }),
  ]);
  if (templates.length !== templateIds.length) {
    plannerRedirect(weekStart, "error", "At least one standard shift is invalid.");
  }
  if (assignees.length !== membershipIds.length) {
    plannerRedirect(weekStart, "error", "At least one assignment is invalid.");
  }
  const templateMap = new Map(
    templates.map((template) => [template.id, template]),
  );
  const assigneeMap = new Map(
    assignees.map((assignee) => [assignee.id, assignee]),
  );
  type Candidate = {
    shiftId?: string;
    templateId?: string;
    title: string;
    startTime: Date;
    endTime: Date;
    breakMinutes: number;
    location?: string;
    membershipIds: Set<string>;
  };
  const existingById = new Map(
    existingShifts.map((shift) => [shift.id, shift]),
  );
  const existingByTemplateStart = new Map(
    existingShifts
      .filter((shift) => shift.templateId)
      .map((shift) => [
        `${shift.templateId}:${shift.startTime.getTime()}`,
        shift,
      ]),
  );
  const candidates: Candidate[] = [];

  for (const plannedShift of parsedPlan.data.shifts) {
    const date = parseISO(plannedShift.date);
    if (
      Number.isNaN(date.getTime()) ||
      plannedShift.date < weekStart ||
      plannedShift.date >= format(addDays(parsedWeekStart, 7), "yyyy-MM-dd")
    ) {
      plannerRedirect(weekStart, "error", "A shift is outside the selected week.");
    }
    const weekday = getISODay(date);
    if (!actor.organization.workingDays.includes(weekday)) {
      plannerRedirect(
        weekStart,
        "error",
        "A shift is scheduled outside the company working days.",
      );
    }
    const uniqueMembershipIds = [...new Set(plannedShift.membershipIds)];
    if (uniqueMembershipIds.length > actor.organization.maxMembersPerShift) {
      plannerRedirect(
        weekStart,
        "error",
        `A shift allows at most ${actor.organization.maxMembersPerShift} employee(s).`,
      );
    }

    if (plannedShift.shiftId) {
      const existing = existingById.get(plannedShift.shiftId);
      if (!existing) {
        plannerRedirect(weekStart, "error", "An existing shift is invalid.");
      }
      candidates.push({
        shiftId: existing.id,
        templateId: existing.templateId ?? undefined,
        title: existing.title,
        startTime: existing.startTime,
        endTime: existing.endTime,
        breakMinutes: existing.breakMinutes,
        location: existing.location ?? undefined,
        membershipIds: new Set(uniqueMembershipIds),
      });
      continue;
    }

    if (plannedShift.templateId) {
      const template = templateMap.get(plannedShift.templateId);
      if (!template) {
        plannerRedirect(weekStart, "error", "Standard shift not found.");
      }
      const occurrence = getTemplateOccurrence({
        date: plannedShift.date,
        startMinutes: template.startMinutes,
        durationMinutes: template.durationMinutes,
        timeZone: actor.organization.timeZone,
      });
      const existing = existingByTemplateStart.get(
        `${template.id}:${occurrence.startTime.getTime()}`,
      );
      candidates.push({
        shiftId: existing?.id,
        templateId: template.id,
        title: template.title,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        breakMinutes: template.breakMinutes,
        location: template.location ?? undefined,
        membershipIds: new Set(uniqueMembershipIds),
      });
      continue;
    }

    const durationMinutes = getTemplateDuration(
      plannedShift.startTime,
      plannedShift.endTime,
    );
    if (plannedShift.breakMinutes >= durationMinutes) {
      plannerRedirect(
        weekStart,
        "error",
        "A custom shift break must be shorter than its duration.",
      );
    }
    const occurrence = getTemplateOccurrence({
      date: plannedShift.date,
      startMinutes: clockToMinutes(plannedShift.startTime),
      durationMinutes,
      timeZone: actor.organization.timeZone,
    });
    candidates.push({
      title: plannedShift.title,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
      breakMinutes: plannedShift.breakMinutes,
      location: plannedShift.location,
      membershipIds: new Set(uniqueMembershipIds),
    });
  }

  const plannedExistingIds = new Set(
    candidates
      .map((candidate) => candidate.shiftId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const candidate of candidates) {
    for (const membershipId of candidate.membershipIds) {
      const member = assigneeMap.get(membershipId);
      if (
        !member ||
        !isAvailableOnShiftDay({
          startTime: candidate.startTime,
          timeZone: actor.organization.timeZone,
          organizationWorkingDays: actor.organization.workingDays,
          memberAvailableWeekdays: member.availableWeekdays,
        })
      ) {
        plannerRedirect(
          weekStart,
          "error",
          "At least one employee is unavailable on a selected weekday.",
        );
      }
      if (
        member.shiftAssignments.some(
          (assignment) =>
            !plannedExistingIds.has(assignment.shift.id) &&
            assignment.shift.startTime < candidate.endTime &&
            assignment.shift.endTime > candidate.startTime,
        )
      ) {
        plannerRedirect(
          weekStart,
          "error",
          "At least one employee already has an overlapping shift.",
        );
      }
    }
  }
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const overlaps =
        left.startTime < right.endTime && left.endTime > right.startTime;
      if (
        overlaps &&
        [...left.membershipIds].some((id) => right.membershipIds.has(id))
      ) {
        plannerRedirect(
          weekStart,
          "error",
          "A newly planned employee has overlapping shifts.",
        );
      }
    }
  }

  const existingDrafts =
    intent === "publish"
      ? existingShifts.filter((shift) => shift.status === ShiftStatus.DRAFT)
      : [];
  if (candidates.length === 0 && existingDrafts.length === 0) {
    plannerRedirect(
      weekStart,
      "error",
      "There are no new shifts or drafts to publish.",
    );
  }

  const createdIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const candidate of candidates) {
      if (candidate.shiftId) {
        await tx.shiftAssignment.deleteMany({
          where: { shiftId: candidate.shiftId },
        });
        if (candidate.membershipIds.size > 0) {
          await tx.shiftAssignment.createMany({
            data: [...candidate.membershipIds].map((membershipId) => ({
              organizationId: actor.organizationId,
              shiftId: candidate.shiftId!,
              membershipId,
            })),
          });
        }
        continue;
      }
      const shift = await tx.shift.create({
        data: {
          organizationId: actor.organizationId,
          templateId: candidate.templateId,
          title: candidate.title,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          breakMinutes: candidate.breakMinutes,
          status:
            intent === "publish"
              ? ShiftStatus.PUBLISHED
              : ShiftStatus.DRAFT,
          location: candidate.location,
          createdById: actor.userId,
        },
      });
      ids.push(shift.id);
      if (candidate.membershipIds.size > 0) {
        await tx.shiftAssignment.createMany({
          data: [...candidate.membershipIds].map((membershipId) => ({
            organizationId: actor.organizationId,
            shiftId: shift.id,
            membershipId,
          })),
        });
      }
    }
    if (intent === "publish" && existingDrafts.length > 0) {
      await tx.shift.updateMany({
        where: { id: { in: existingDrafts.map((shift) => shift.id) } },
        data: { status: ShiftStatus.PUBLISHED },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action:
          intent === "publish"
            ? "schedule.week-planned-and-published"
            : "schedule.week-planned",
        entityType: "Shift",
        metadata: {
          weekStart,
          created: ids.length,
          updated: plannedExistingIds.size,
          publishedExisting: existingDrafts.length,
          shifts: parsedPlan.data.shifts.length,
        },
      },
    });
    return ids;
  });

  if (intent === "publish") {
    const publishedIds = [
      ...createdIds,
      ...existingDrafts.map((shift) => shift.id),
    ];
    await Promise.all(
      publishedIds.map((shiftId) =>
        notifyAssignedMembers({
          organizationId: actor.organizationId,
          shiftId,
          subject: "Your OpenRoster schedule was published",
          lines: ["A shift assigned to you has been published."],
        }),
      ),
    );
  }

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  plannerRedirect(
    weekStart,
    "success",
    intent === "publish"
      ? "Week saved and published."
      : "Week saved as draft.",
  );
}
