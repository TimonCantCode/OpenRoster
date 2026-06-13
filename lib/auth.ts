import { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { createToken, hashToken } from "@/lib/tokens";

const SESSION_COOKIE = "openroster_session";
const ORGANIZATION_COOKIE = "openroster_organization";

export async function createSession(userId: string, organizationId?: string) {
  const token = createToken();
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  if (organizationId) {
    cookieStore.set(ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  }
}

export async function setActiveOrganization(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }

  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ORGANIZATION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
}

export async function requireMembership(roles?: Role[]) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const preferredOrganizationId = cookieStore.get(ORGANIZATION_COOKIE)?.value;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      isActive: true,
      ...(preferredOrganizationId
        ? { organizationId: preferredOrganizationId }
        : {}),
    },
    include: { organization: true, user: true },
    orderBy: { createdAt: "asc" },
  });

  const fallback =
    membership ??
    (await prisma.membership.findFirst({
      where: { userId: user.id, isActive: true },
      include: { organization: true, user: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!fallback) redirect("/auth/login?error=No+active+access");
  if (roles && !roles.includes(fallback.role)) {
    redirect("/app?error=Insufficient+permissions");
  }

  return fallback;
}

export async function getMembershipOrNull() {
  const user = await getCurrentUser();
  if (!user) return null;

  return prisma.membership.findFirst({
    where: { userId: user.id, isActive: true },
    include: { organization: true, user: true },
    orderBy: { createdAt: "asc" },
  });
}
