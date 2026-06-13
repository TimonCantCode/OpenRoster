"use server";

import { Role, ShiftStatus, SwapRequestStatus } from "@prisma/client";
import { differenceInMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, redirectWithMessage } from "@/lib/action-utils";
import { requireMembership } from "@/lib/auth";
import { isAvailableOnShiftDay } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { sendShiftChangeEmail } from "@/lib/mail";
import {
  getShiftNotificationLines,
  notifyAssignedMembers,
} from "@/lib/shift-notifications";
import { optionalString } from "@/lib/utils";
import { firstValidationError, shiftSchema } from "@/lib/validators";

function parseShift(formData: FormData) {
  return shiftSchema.safeParse({
    shiftId: optionalString(formData.get("shiftId")) ?? undefined,
    title: formString(formData, "title"),
    startTime: formString(formData, "startTime"),
    endTime: formString(formData, "endTime"),
    breakMinutes: formString(formData, "breakMinutes"),
    isOpen: formData.get("isOpen") ? "true" : "false",
    location: optionalString(formData.get("location")) ?? undefined,
    notes: optionalString(formData.get("notes")) ?? undefined,
    membershipIds: formData.getAll("membershipIds").map(String),
  });
}

async function validateAssignees(
  organizationId: string,
  membershipIds: string[],
  startTime: Date,
  endTime: Date,
  timeZone: string,
  workingDays: number[],
  excludeShiftId?: string,
) {
  const uniqueIds = [...new Set(membershipIds)];
  const memberships = await prisma.membership.findMany({
    where: {
      id: { in: uniqueIds },
      organizationId,
      isActive: true,
    },
    include: {
      shiftAssignments: {
        where: {
          shift: {
            startTime: { lt: endTime },
            endTime: { gt: startTime },
            ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
          },
        },
        select: { id: true },
      },
    },
  });
  if (memberships.length !== uniqueIds.length) return null;

  const allAvailable = memberships.every(
    (member) =>
      member.shiftAssignments.length === 0 &&
      isAvailableOnShiftDay({
        startTime,
        timeZone,
        organizationWorkingDays: workingDays,
        memberAvailableWeekdays: member.availableWeekdays,
      }),
  );
  return allAvailable ? uniqueIds : null;
}

export async function createShiftAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const parsed = parseShift(formData);
  if (!parsed.success) {
    redirectWithMessage(
      "/app/schedule/new",
      "error",
      firstValidationError(parsed.error),
    );
  }

  const startTime = fromZonedTime(
    parsed.data.startTime,
    actor.organization.timeZone,
  );
  const endTime = fromZonedTime(
    parsed.data.endTime,
    actor.organization.timeZone,
  );
  if (
    endTime <= startTime ||
    parsed.data.breakMinutes >= differenceInMinutes(endTime, startTime)
  ) {
    redirectWithMessage(
      "/app/schedule/new",
      "error",
      "Times or break duration are invalid.",
    );
  }
  if (parsed.data.membershipIds.length > actor.organization.maxMembersPerShift) {
    redirectWithMessage(
      "/app/schedule/new",
      "error",
      `This shift allows at most ${actor.organization.maxMembersPerShift} employee(s).`,
    );
  }
  const membershipIds = await validateAssignees(
    actor.organizationId,
    parsed.data.membershipIds,
    startTime,
    endTime,
    actor.organization.timeZone,
    actor.organization.workingDays,
  );
  if (!membershipIds) {
    redirectWithMessage(
      "/app/schedule/new",
      "error",
      "At least one employee is unavailable or already assigned at this time.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.create({
      data: {
        organizationId: actor.organizationId,
        title: parsed.data.title,
        startTime,
        endTime,
        breakMinutes: parsed.data.breakMinutes,
        isOpen: actor.organization.allowOpenShifts && parsed.data.isOpen === "true",
        location: parsed.data.location,
        notes: parsed.data.notes,
        createdById: actor.userId,
      },
    });
    if (membershipIds.length > 0) {
      await tx.shiftAssignment.createMany({
        data: membershipIds.map((membershipId) => ({
          shiftId: shift.id,
          membershipId,
          organizationId: actor.organizationId,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "shift.created",
        entityType: "Shift",
        entityId: shift.id,
      },
    });
  });

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  redirect("/app/schedule?success=Shift+created");
}

export async function updateShiftAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const parsed = parseShift(formData);
  const fallbackId = formString(formData, "shiftId");
  if (!parsed.success || !parsed.data.shiftId) {
    redirectWithMessage(
      `/app/schedule/${encodeURIComponent(fallbackId)}/edit`,
      "error",
      parsed.success ? "Shift ID is missing." : firstValidationError(parsed.error),
    );
  }

  const shift = await prisma.shift.findFirst({
    where: { id: parsed.data.shiftId, organizationId: actor.organizationId },
    include: {
      assignments: {
        include: { membership: { include: { user: true } } },
      },
    },
  });
  if (!shift) {
    redirectWithMessage("/app/schedule", "error", "Shift not found.");
  }
  const startTime = fromZonedTime(
    parsed.data.startTime,
    actor.organization.timeZone,
  );
  const endTime = fromZonedTime(
    parsed.data.endTime,
    actor.organization.timeZone,
  );
  if (
    endTime <= startTime ||
    parsed.data.breakMinutes >= differenceInMinutes(endTime, startTime)
  ) {
    redirectWithMessage(
      `/app/schedule/${shift.id}/edit`,
      "error",
      "Times or break duration are invalid.",
    );
  }
  if (parsed.data.membershipIds.length > actor.organization.maxMembersPerShift) {
    redirectWithMessage(
      `/app/schedule/${shift.id}/edit`,
      "error",
      `This shift allows at most ${actor.organization.maxMembersPerShift} employee(s).`,
    );
  }
  const membershipIds = await validateAssignees(
    actor.organizationId,
    parsed.data.membershipIds,
    startTime,
    endTime,
    actor.organization.timeZone,
    actor.organization.workingDays,
    shift.id,
  );
  if (!membershipIds) {
    redirectWithMessage(
      `/app/schedule/${shift.id}/edit`,
      "error",
      "At least one employee is unavailable or already assigned at this time.",
    );
  }

  const wasPublished = shift.status === ShiftStatus.PUBLISHED;

  await prisma.$transaction(async (tx) => {
    await tx.shiftAssignment.deleteMany({ where: { shiftId: shift.id } });
    await tx.shift.update({
      where: { id: shift.id },
      data: {
        title: parsed.data.title,
        startTime,
        endTime,
        breakMinutes: parsed.data.breakMinutes,
        isOpen: actor.organization.allowOpenShifts && parsed.data.isOpen === "true",
        location: parsed.data.location,
        notes: parsed.data.notes,
      },
    });
    if (membershipIds.length > 0) {
      await tx.shiftAssignment.createMany({
        data: membershipIds.map((membershipId) => ({
          shiftId: shift.id,
          membershipId,
          organizationId: actor.organizationId,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "shift.updated",
        entityType: "Shift",
        entityId: shift.id,
      },
    });
  });

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  if (wasPublished) {
    await notifyAssignedMembers({
      organizationId: actor.organizationId,
      shiftId: shift.id,
      subject: "Your OpenRoster shift was updated",
      lines: [
        "A published shift assigned to you was updated:",
        ...getShiftNotificationLines({
          title: parsed.data.title,
          startTime,
          endTime,
          timeZone: actor.organization.timeZone,
        }),
      ],
    });
    const currentMembershipIds = new Set(membershipIds);
    await Promise.all(
      shift.assignments
        .filter(
          (assignment) =>
            !currentMembershipIds.has(assignment.membershipId) &&
            assignment.membership.notifyShiftChanges,
        )
        .map((assignment) =>
          sendShiftChangeEmail({
            email: assignment.membership.user.email,
            organizationName: actor.organization.name,
            subject: "You were removed from an OpenRoster shift",
            lines: [
              "You are no longer assigned to this shift:",
              ...getShiftNotificationLines({
                title: parsed.data.title,
                startTime,
                endTime,
                timeZone: actor.organization.timeZone,
              }),
            ],
          }),
        ),
    );
  }
  redirect("/app/schedule?success=Shift+updated");
}

export async function deleteShiftAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const shiftId = formString(formData, "shiftId");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, organizationId: actor.organizationId },
    include: {
      assignments: {
        include: { membership: { include: { user: true } } },
      },
    },
  });
  if (!shift) {
    redirectWithMessage("/app/schedule", "error", "Shift not found.");
  }

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "shift.deleted",
        entityType: "Shift",
        entityId: shift.id,
        metadata: { title: shift.title },
      },
    }),
    prisma.shift.delete({ where: { id: shift.id } }),
  ]);

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  if (shift.status === ShiftStatus.PUBLISHED) {
    await Promise.all(
      shift.assignments
        .filter((assignment) => assignment.membership.notifyShiftChanges)
        .map((assignment) =>
          sendShiftChangeEmail({
            email: assignment.membership.user.email,
            organizationName: actor.organization.name,
            subject: "Your OpenRoster shift was cancelled",
            lines: [
              "A shift assigned to you was deleted:",
              ...getShiftNotificationLines({
                title: shift.title,
                startTime: shift.startTime,
                endTime: shift.endTime,
                timeZone: actor.organization.timeZone,
              }),
            ],
          }),
        ),
    );
  }
  redirect("/app/schedule?success=Shift+deleted");
}

export async function assignMemberToShiftAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const shiftId = formString(formData, "shiftId");
  const membershipId = formString(formData, "membershipId");
  const requestedReturnTo = formString(formData, "returnTo");
  const returnTo = requestedReturnTo.startsWith("/app/schedule")
    ? requestedReturnTo
    : "/app/schedule";

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, organizationId: actor.organizationId },
    include: { assignments: true },
  });
  if (!shift) {
    redirectWithMessage(returnTo, "error", "Shift not found.");
  }
  if (shift.assignments.length >= actor.organization.maxMembersPerShift) {
    redirectWithMessage(
      returnTo,
      "error",
      `This shift already has the maximum of ${actor.organization.maxMembersPerShift} employee(s).`,
    );
  }
  const member = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId: actor.organizationId,
        isActive: true,
      },
      include: {
        user: true,
        shiftAssignments: {
          where: {
            shift: {
              startTime: { lt: shift.endTime },
              endTime: { gt: shift.startTime },
            },
          },
          include: { shift: true },
        },
      },
    });
  if (!member) {
    redirectWithMessage(returnTo, "error", "Employee not found.");
  }

  const hasConflict = member.shiftAssignments.some(
    (assignment) =>
      assignment.shift.id !== shift.id &&
      assignment.shift.startTime < shift.endTime &&
      assignment.shift.endTime > shift.startTime,
  );
  const available =
    !hasConflict &&
    isAvailableOnShiftDay({
      startTime: shift.startTime,
      timeZone: actor.organization.timeZone,
      organizationWorkingDays: actor.organization.workingDays,
      memberAvailableWeekdays: member.availableWeekdays,
    });
  if (!available) {
    redirectWithMessage(
      returnTo,
      "error",
      "This employee is unavailable or already assigned at this time.",
    );
  }

  await prisma.shiftAssignment.upsert({
    where: {
      shiftId_membershipId: { shiftId: shift.id, membershipId: member.id },
    },
    create: {
      organizationId: actor.organizationId,
      shiftId: shift.id,
      membershipId: member.id,
    },
    update: {},
  });
  await prisma.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "shift.member-assigned",
      entityType: "Shift",
      entityId: shift.id,
      metadata: { membershipId: member.id },
    },
  });

  revalidatePath("/app/schedule");
  if (shift.status === ShiftStatus.PUBLISHED && member.notifyShiftChanges) {
    await sendShiftChangeEmail({
      email: member.user.email,
      organizationName: actor.organization.name,
      subject: "You were assigned to an OpenRoster shift",
      lines: [
        "You were assigned to this shift:",
        ...getShiftNotificationLines({
          title: shift.title,
          startTime: shift.startTime,
          endTime: shift.endTime,
          timeZone: actor.organization.timeZone,
        }),
      ],
    });
  }
  redirectWithMessage(returnTo, "success", "Employee assigned.");
}

export async function publishWeekAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const weekStart = formString(formData, "weekStart");
  const returnTo = formString(formData, "returnTo").startsWith("/app/schedule")
    ? formString(formData, "returnTo")
    : "/app/schedule";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    redirectWithMessage(returnTo, "error", "Invalid week.");
  }

  const from = fromZonedTime(`${weekStart}T00:00`, actor.organization.timeZone);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  const shifts = await prisma.shift.findMany({
    where: {
      organizationId: actor.organizationId,
      startTime: { gte: from, lt: to },
      status: ShiftStatus.DRAFT,
    },
    select: { id: true },
  });
  if (shifts.length === 0) {
    redirectWithMessage(returnTo, "error", "There are no draft shifts to publish.");
  }

  await prisma.$transaction([
    prisma.shift.updateMany({
      where: { id: { in: shifts.map((shift) => shift.id) } },
      data: { status: ShiftStatus.PUBLISHED },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "schedule.week-published",
        entityType: "Shift",
        metadata: { weekStart, count: shifts.length },
      },
    }),
  ]);

  await Promise.all(
    shifts.map((shift) =>
      notifyAssignedMembers({
        organizationId: actor.organizationId,
        shiftId: shift.id,
        subject: "Your OpenRoster schedule was published",
        lines: ["A shift assigned to you has been published."],
      }),
    ),
  );

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  redirectWithMessage(returnTo, "success", "Week published.");
}

export async function claimOpenShiftAction(formData: FormData) {
  const actor = await requireMembership([Role.EMPLOYEE, Role.ADMIN, Role.OWNER]);
  const shiftId = formString(formData, "shiftId");
  const returnTo = formString(formData, "returnTo").startsWith("/app/schedule")
    ? formString(formData, "returnTo")
    : "/app/schedule";
  if (!actor.organization.allowOpenShifts) {
    redirectWithMessage(returnTo, "error", "Open shifts are disabled.");
  }

  const shift = await prisma.shift.findFirst({
    where: {
      id: shiftId,
      organizationId: actor.organizationId,
      status: ShiftStatus.PUBLISHED,
      isOpen: true,
    },
    include: { assignments: true },
  });
  if (!shift) {
    redirectWithMessage(returnTo, "error", "Open shift not found.");
  }
  if (shift.assignments.length >= actor.organization.maxMembersPerShift) {
    redirectWithMessage(returnTo, "error", "This shift is already full.");
  }

  const conflicts = await prisma.shiftAssignment.count({
    where: {
      membershipId: actor.id,
      shift: {
        startTime: { lt: shift.endTime },
        endTime: { gt: shift.startTime },
      },
    },
  });
  if (
    conflicts > 0 ||
    !isAvailableOnShiftDay({
      startTime: shift.startTime,
      timeZone: actor.organization.timeZone,
      organizationWorkingDays: actor.organization.workingDays,
      memberAvailableWeekdays: actor.availableWeekdays,
    })
  ) {
    redirectWithMessage(
      returnTo,
      "error",
      "You are unavailable or already assigned at this time.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.shiftAssignment.create({
      data: {
        organizationId: actor.organizationId,
        shiftId: shift.id,
        membershipId: actor.id,
      },
    });
    if (shift.assignments.length + 1 >= actor.organization.maxMembersPerShift) {
      await tx.shift.update({
        where: { id: shift.id },
        data: { isOpen: false },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "shift.open-claimed",
        entityType: "Shift",
        entityId: shift.id,
      },
    });
  });

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  redirectWithMessage(returnTo, "success", "Open shift claimed.");
}

export async function requestShiftSwapAction(formData: FormData) {
  const actor = await requireMembership();
  const shiftId = formString(formData, "shiftId");
  const returnTo = formString(formData, "returnTo").startsWith("/app/schedule")
    ? formString(formData, "returnTo")
    : "/app/schedule";
  if (!actor.organization.allowShiftSwaps) {
    redirectWithMessage(returnTo, "error", "Shift swaps are disabled.");
  }

  const shift = await prisma.shift.findFirst({
    where: {
      id: shiftId,
      organizationId: actor.organizationId,
      status: ShiftStatus.PUBLISHED,
      assignments: { some: { membershipId: actor.id } },
    },
  });
  if (!shift) {
    redirectWithMessage(returnTo, "error", "Shift not found.");
  }

  const existing = await prisma.shiftSwapRequest.findFirst({
    where: {
      organizationId: actor.organizationId,
      shiftId: shift.id,
      requesterMembershipId: actor.id,
      status: SwapRequestStatus.PENDING,
    },
  });
  if (existing) {
    redirectWithMessage(returnTo, "error", "A swap request is already pending.");
  }

  await prisma.shiftSwapRequest.create({
    data: {
      organizationId: actor.organizationId,
      shiftId: shift.id,
      requesterMembershipId: actor.id,
    },
  });

  revalidatePath("/app/schedule");
  redirectWithMessage(returnTo, "success", "Swap request sent.");
}

export async function decideShiftSwapRequestAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const requestId = formString(formData, "requestId");
  const decision = formString(formData, "decision");
  const returnTo = formString(formData, "returnTo").startsWith("/app/schedule")
    ? formString(formData, "returnTo")
    : "/app/schedule";
  if (decision !== "approve" && decision !== "reject") {
    redirectWithMessage(returnTo, "error", "Invalid decision.");
  }

  const request = await prisma.shiftSwapRequest.findFirst({
    where: {
      id: requestId,
      organizationId: actor.organizationId,
      status: SwapRequestStatus.PENDING,
    },
    include: {
      shift: true,
      requester: { include: { user: true } },
    },
  });
  if (!request) {
    redirectWithMessage(returnTo, "error", "Swap request not found.");
  }

  await prisma.$transaction(async (tx) => {
    if (decision === "approve") {
      await tx.shiftAssignment.deleteMany({
        where: {
          shiftId: request.shiftId,
          membershipId: request.requesterMembershipId,
        },
      });
      if (actor.organization.allowOpenShifts) {
        await tx.shift.update({
          where: { id: request.shiftId },
          data: { isOpen: true },
        });
      }
    }
    await tx.shiftSwapRequest.update({
      where: { id: request.id },
      data: {
        status:
          decision === "approve"
            ? SwapRequestStatus.APPROVED
            : SwapRequestStatus.REJECTED,
        decidedById: actor.userId,
        decidedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action:
          decision === "approve"
            ? "shift-swap.approved"
            : "shift-swap.rejected",
        entityType: "ShiftSwapRequest",
        entityId: request.id,
      },
    });
  });

  if (request.requester.notifyShiftChanges) {
    await sendShiftChangeEmail({
      email: request.requester.user.email,
      organizationName: actor.organization.name,
      subject:
        decision === "approve"
          ? "Your OpenRoster swap request was approved"
          : "Your OpenRoster swap request was rejected",
      lines: [
        decision === "approve"
          ? "Your shift swap request was approved."
          : "Your shift swap request was rejected.",
        ...getShiftNotificationLines({
          title: request.shift.title,
          startTime: request.shift.startTime,
          endTime: request.shift.endTime,
          timeZone: actor.organization.timeZone,
        }),
      ],
    });
  }

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  redirectWithMessage(returnTo, "success", "Swap request updated.");
}
