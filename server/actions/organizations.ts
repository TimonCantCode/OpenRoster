"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { formString, redirectWithMessage } from "@/lib/action-utils";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  firstValidationError,
  organizationSchema,
} from "@/lib/validators";

export async function updateOrganizationAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER]);
  const parsed = organizationSchema.safeParse({
    name: formString(formData, "name"),
    timeZone: formString(formData, "timeZone"),
    maxMembersPerShift: formString(formData, "maxMembersPerShift"),
    allowShiftSwaps: formData.get("allowShiftSwaps") ? "true" : "false",
    allowOpenShifts: formData.get("allowOpenShifts") ? "true" : "false",
    workingDays: formData.getAll("workingDays").map(String),
  });
  if (!parsed.success) {
    redirectWithMessage(
      "/app/settings",
      "error",
      firstValidationError(parsed.error),
    );
  }

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: actor.organizationId },
      data: {
        name: parsed.data.name,
        timeZone: parsed.data.timeZone,
        maxMembersPerShift: parsed.data.maxMembersPerShift,
        allowShiftSwaps: parsed.data.allowShiftSwaps === "true",
        allowOpenShifts: parsed.data.allowOpenShifts === "true",
        workingDays: parsed.data.workingDays,
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "organization.updated",
        entityType: "Organization",
        entityId: actor.organizationId,
        metadata: {
          name: parsed.data.name,
          timeZone: parsed.data.timeZone,
          maxMembersPerShift: parsed.data.maxMembersPerShift,
          allowShiftSwaps: parsed.data.allowShiftSwaps === "true",
          allowOpenShifts: parsed.data.allowOpenShifts === "true",
          workingDays: parsed.data.workingDays,
        },
      },
    }),
  ]);

  revalidatePath("/app", "layout");
  redirectWithMessage(
    "/app/settings",
    "success",
    "Organization updated.",
  );
}
