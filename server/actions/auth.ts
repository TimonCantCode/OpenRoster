"use server";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formString, redirectWithMessage } from "@/lib/action-utils";
import {
  createSession,
  deleteCurrentSession,
  requireUser,
  setActiveOrganization,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordFailedLogin,
} from "@/lib/rate-limit";
import { normalizeEmail, slugify } from "@/lib/utils";
import {
  firstValidationError,
  loginSchema,
  registerSchema,
} from "@/lib/validators";

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formString(formData, "name"),
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    organizationName: formString(formData, "organizationName"),
  });

  if (!parsed.success) {
    redirectWithMessage(
      "/auth/register",
      "error",
      firstValidationError(parsed.error),
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const passwordHash = await hashPassword(parsed.data.password);
  const slugBase = slugify(parsed.data.organizationName) || "organisation";
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: parsed.data.name,
          passwordHash,
          emailVerified: new Date(),
        },
      });
      const organization = await tx.organization.create({
        data: { name: parsed.data.organizationName, slug },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "OWNER",
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorId: user.id,
          action: "organization.created",
          entityType: "Organization",
          entityId: organization.id,
        },
      });
      return { user, organization };
    });

    await createSession(result.user.id, result.organization.id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirectWithMessage(
        "/auth/register",
        "error",
        "An account already exists for this email address.",
      );
    }
    throw error;
  }

  redirect("/app");
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });

  if (!parsed.success) {
    redirectWithMessage(
      "/auth/login",
      "error",
      "Email or password is invalid.",
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const requestHeaders = await headers();
  const ipAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    "unknown";

  let rateLimitKey: string;
  try {
    rateLimitKey = await assertLoginAllowed(email, ipAddress);
  } catch {
    redirectWithMessage(
      "/auth/login",
      "error",
      "Too many sign-in attempts. Please try again in 15 minutes.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  const passwordIsValid = user
    ? await verifyPassword(user.passwordHash, parsed.data.password)
    : (await hashPassword(parsed.data.password), false);

  if (!user || !passwordIsValid || user.memberships.length === 0) {
    await recordFailedLogin(rateLimitKey);
    redirectWithMessage(
      "/auth/login",
      "error",
      "Email or password is invalid.",
    );
  }

  await clearLoginFailures(rateLimitKey);
  await createSession(user.id, user.memberships[0].organizationId);
  redirect("/app");
}

export async function logoutAction() {
  await deleteCurrentSession();
  redirect("/auth/login");
}

export async function switchOrganizationAction(formData: FormData) {
  const user = await requireUser();
  const organizationId = formString(formData, "organizationId");
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, organizationId, isActive: true },
  });
  if (!membership) {
    redirectWithMessage("/app", "error", "Organization is not available.");
  }

  await setActiveOrganization(membership.organizationId);
  redirect("/app");
}
