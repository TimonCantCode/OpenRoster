"use server";

import { Role } from "@prisma/client";
import {
  eachDayOfInterval,
  format,
  getISODay,
  parseISO,
} from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString } from "@/lib/action-utils";
import { requireMembership } from "@/lib/auth";
import { isAvailableOnShiftDay } from "@/lib/availability";
import { prisma } from "@/lib/db";
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
} from "@/lib/validators";

function standardRedirect(type: "error" | "success", message: string): never {
  const params = new URLSearchParams({ mode: "standard", [type]: message });
  redirect(`/app/schedule/new?${params.toString()}`);
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
