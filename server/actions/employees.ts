"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { formString, redirectWithMessage } from "@/lib/action-utils";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  firstValidationError,
  membershipSchema,
} from "@/lib/validators";

export async function updateMembershipAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const parsed = membershipSchema.safeParse({
    membershipId: formString(formData, "membershipId"),
    role: formString(formData, "role"),
    weeklyTargetHours: formString(formData, "weeklyTargetHours"),
    isActive: formString(formData, "isActive"),
    availableWeekdays: formData.getAll("availableWeekdays").map(String),
  });

  if (!parsed.success) {
    redirectWithMessage(
      "/app/employees",
      "error",
      firstValidationError(parsed.error),
    );
  }

  const target = await prisma.membership.findFirst({
    where: {
      id: parsed.data.membershipId,
      organizationId: actor.organizationId,
    },
  });
  if (!target) {
    redirectWithMessage("/app/employees", "error", "Member not found.");
  }
  if (target.role === Role.OWNER) {
    redirectWithMessage(
      "/app/employees",
      "error",
      "The owner cannot be changed here.",
    );
  }
  if (target.userId === actor.userId && parsed.data.isActive === "false") {
    redirectWithMessage(
      "/app/employees",
      "error",
      "You cannot deactivate yourself.",
    );
  }
  if (
    actor.role === Role.ADMIN &&
    (target.role === Role.ADMIN || parsed.data.role === Role.ADMIN)
  ) {
    redirectWithMessage(
      "/app/employees",
      "error",
      "Only owners can change admin roles.",
    );
  }

  await prisma.$transaction([
    prisma.membership.update({
      where: { id: target.id },
      data: {
        role: parsed.data.role,
        weeklyTargetMinutes: Math.round(parsed.data.weeklyTargetHours * 60),
        isActive: parsed.data.isActive === "true",
        availableWeekdays: parsed.data.availableWeekdays,
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "membership.updated",
        entityType: "Membership",
        entityId: target.id,
        metadata: {
          role: parsed.data.role,
          isActive: parsed.data.isActive === "true",
          availableWeekdays: parsed.data.availableWeekdays,
        },
      },
    }),
  ]);

  revalidatePath("/app/employees");
  redirectWithMessage(
    "/app/employees",
    "success",
    "Employee updated.",
  );
}
