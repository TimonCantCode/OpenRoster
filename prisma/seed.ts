import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/passwords";
import { normalizeEmail, slugify } from "../lib/utils";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME;
  const organizationName = process.env.SEED_ORGANIZATION_NAME;

  if (!email || !password || !name || !organizationName) {
    console.info(
      "Seed skipped. Set SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_NAME and SEED_ORGANIZATION_NAME.",
    );
    return;
  }
  if (password.length < 12) {
    throw new Error("SEED_OWNER_PASSWORD must contain at least 12 characters.");
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    console.info(`Seed skipped. User ${normalizedEmail} already exists.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const slug = `${slugify(organizationName) || "organisation"}-${crypto.randomUUID().slice(0, 8)}`;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        name,
        passwordHash,
        emailVerified: new Date(),
      },
    });
    const organization = await tx.organization.create({
      data: { name: organizationName, slug },
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
        action: "organization.seeded",
        entityType: "Organization",
        entityId: organization.id,
      },
    });
  });

  console.info(`Created owner ${normalizedEmail} and organization ${organizationName}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
