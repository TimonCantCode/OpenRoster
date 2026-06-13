import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function rateLimitKey(email: string, ipAddress: string) {
  return createHash("sha256")
    .update(`${env.APP_SECRET}:${email}:${ipAddress}`)
    .digest("hex");
}

export async function assertLoginAllowed(email: string, ipAddress: string) {
  const key = rateLimitKey(email, ipAddress);
  const record = await prisma.loginRateLimit.findUnique({ where: { key } });

  if (record?.blockedUntil && record.blockedUntil > new Date()) {
    throw new Error("Too many sign-in attempts. Please try again later.");
  }

  return key;
}

export async function recordFailedLogin(key: string) {
  const now = new Date();
  const record = await prisma.loginRateLimit.findUnique({ where: { key } });
  const windowExpired =
    !record || now.getTime() - record.windowStart.getTime() > WINDOW_MS;
  const count = windowExpired ? 1 : record.count + 1;

  await prisma.loginRateLimit.upsert({
    where: { key },
    create: {
      key,
      count,
      windowStart: now,
      blockedUntil:
        count >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null,
    },
    update: {
      count,
      windowStart: windowExpired ? now : record?.windowStart,
      blockedUntil:
        count >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null,
    },
  });
}

export async function clearLoginFailures(key: string) {
  await prisma.loginRateLimit.deleteMany({ where: { key } });
}
