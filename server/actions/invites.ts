"use server";

import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { formString, redirectWithMessage } from "@/lib/action-utils";
import { createSession, requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendInviteEmail } from "@/lib/mail";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { createToken, hashToken } from "@/lib/tokens";
import { normalizeEmail, optionalString } from "@/lib/utils";
import {
  acceptInviteSchema,
  firstValidationError,
  inviteSchema,
} from "@/lib/validators";

export async function createInviteAction(formData: FormData) {
  const actor = await requireMembership([Role.OWNER, Role.ADMIN]);
  const parsed = inviteSchema.safeParse({
    email: formString(formData, "email"),
    name: optionalString(formData.get("name")) ?? undefined,
    role: formString(formData, "role"),
    weeklyTargetHours: formString(formData, "weeklyTargetHours"),
    availableWeekdays: formData.getAll("availableWeekdays").map(String),
  });

  if (!parsed.success) {
    redirectWithMessage(
      "/app/employees",
      "error",
      firstValidationError(parsed.error),
    );
  }
  if (actor.role === Role.ADMIN && parsed.data.role === Role.ADMIN) {
    redirectWithMessage(
      "/app/employees",
      "error",
      "Only owners can invite admins.",
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const existingMembership = await prisma.membership.findFirst({
    where: {
      organizationId: actor.organizationId,
      user: { email },
    },
  });
  if (existingMembership) {
    redirectWithMessage(
      "/app/employees",
      "error",
      "This person is already a member of the organization.",
    );
  }

  await prisma.invite.deleteMany({
    where: {
      organizationId: actor.organizationId,
      email,
      acceptedAt: null,
    },
  });

  const token = createToken();
  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.invite.create({
      data: {
        organizationId: actor.organizationId,
        email,
        name: parsed.data.name,
        role: parsed.data.role,
        weeklyTargetMinutes: Math.round(parsed.data.weeklyTargetHours * 60),
        availableWeekdays: parsed.data.availableWeekdays,
        tokenHash: hashToken(token),
        expiresAt: new Date(
          Date.now() + env.INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
        ),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "invite.created",
        entityType: "Invite",
        entityId: created.id,
        metadata: { email, role: parsed.data.role },
      },
    });
    return created;
  });

  const inviteUrl = `${env.APP_URL}/invite/${token}`;
  try {
    await sendInviteEmail({
      email,
      organizationName: actor.organization.name,
      inviteUrl,
    });
  } catch (error) {
    console.error("Could not send invite email", error);
    await prisma.invite.delete({ where: { id: invite.id } });
    redirectWithMessage(
      "/app/employees",
      "error",
      "Email could not be sent. Check the SMTP configuration and app logs.",
    );
  }

  redirectWithMessage(
    "/app/employees",
    "success",
    "Invitation sent.",
  );
}

export async function acceptInviteAction(formData: FormData) {
  const parsed = acceptInviteSchema.safeParse({
    token: formString(formData, "token"),
    name: formString(formData, "name"),
    password: formString(formData, "password"),
  });

  if (!parsed.success) {
    redirectWithMessage(
      `/invite/${encodeURIComponent(formString(formData, "token"))}`,
      "error",
      firstValidationError(parsed.error),
    );
  }

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    redirectWithMessage(
      "/auth/login",
      "error",
      "This invitation is invalid or has expired.",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invite.email },
  });
  if (
    existingUser &&
    !(await verifyPassword(existingUser.passwordHash, parsed.data.password))
  ) {
    redirectWithMessage(
      `/invite/${encodeURIComponent(parsed.data.token)}`,
      "error",
      "An account already exists for this email. Use its existing password.",
    );
  }

  const passwordHash = existingUser
    ? existingUser.passwordHash
    : await hashPassword(parsed.data.password);

  const user = await prisma.$transaction(async (tx) => {
    const acceptedUser = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: { emailVerified: existingUser.emailVerified ?? new Date() },
        })
      : await tx.user.create({
          data: {
            email: invite.email,
            name: parsed.data.name,
            passwordHash,
            emailVerified: new Date(),
          },
        });

    await tx.membership.upsert({
      where: {
        userId_organizationId: {
          userId: acceptedUser.id,
          organizationId: invite.organizationId,
        },
      },
      create: {
        userId: acceptedUser.id,
        organizationId: invite.organizationId,
        role: invite.role,
        weeklyTargetMinutes: invite.weeklyTargetMinutes,
        availableWeekdays: invite.availableWeekdays,
      },
      update: {
        role: invite.role,
        weeklyTargetMinutes: invite.weeklyTargetMinutes,
        availableWeekdays: invite.availableWeekdays,
        isActive: true,
      },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        organizationId: invite.organizationId,
        actorId: acceptedUser.id,
        action: "invite.accepted",
        entityType: "Invite",
        entityId: invite.id,
      },
    });
    return acceptedUser;
  });

  await createSession(user.id, invite.organizationId);
  redirect("/app");
}
