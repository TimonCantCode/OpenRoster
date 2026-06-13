"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { formString, redirectWithMessage } from "@/lib/action-utils";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  adjustmentSchema,
  firstValidationError,
} from "@/lib/validators";

export async function createAdjustmentAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const parsed = adjustmentSchema.safeParse({
    membershipId: formString(formData, "membershipId"),
    minutes: formString(formData, "minutes"),
    reason: formString(formData, "reason"),
  });
  if (!parsed.success) {
    redirectWithMessage(
      "/app/hours",
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
    redirectWithMessage("/app/hours", "error", "Employee not found.");
  }

  await prisma.$transaction(async (tx) => {
    const adjustment = await tx.timeAdjustment.create({
      data: {
        organizationId: actor.organizationId,
        membershipId: target.id,
        minutes: parsed.data.minutes,
        reason: parsed.data.reason,
        createdById: actor.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "time-adjustment.created",
        entityType: "TimeAdjustment",
        entityId: adjustment.id,
        metadata: { minutes: parsed.data.minutes },
      },
    });
  });

  revalidatePath("/app/hours");
  redirectWithMessage(
    "/app/hours",
    "success",
    "Adjustment added.",
  );
}
