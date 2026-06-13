import { Role } from "@prisma/client";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { ShiftForm } from "@/components/shift-form";
import { StandardShiftManager } from "@/components/standard-shift-manager";
import {
  buttonClass,
  secondaryButtonClass,
} from "@/components/ui/button";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMessages } from "@/lib/i18n";
import { createShiftAction } from "@/server/actions/shifts";

export default async function NewShiftPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const membership = await requireMembership([Role.OWNER, Role.ADMIN]);
  const query = await searchParams;
  const mode = query.mode === "standard" ? "standard" : "custom";
  const messages = getMessages(membership.user.language);
  const [members, templates] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: membership.organizationId, isActive: true },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.shiftTemplate.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: [{ title: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return (
    <>
      <PageHeading
        title={
          mode === "standard" ? messages.standardRepeat : messages.newShift
        }
        description={`${messages.timeZoneHint} ${membership.organization.timeZone}.`}
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/app/schedule/new"
          className={mode === "custom" ? buttonClass : secondaryButtonClass}
        >
          {messages.singleShift}
        </Link>
        <Link
          href="/app/schedule/new?mode=standard"
          className={mode === "standard" ? buttonClass : secondaryButtonClass}
        >
          {messages.standardRepeat}
        </Link>
      </div>
      {mode === "standard" ? (
        <StandardShiftManager
          templates={templates}
          members={members}
          error={query.error}
          success={query.success}
          messages={messages}
          workingDays={membership.organization.workingDays}
        />
      ) : (
        <ShiftForm
          action={createShiftAction}
          members={members}
          timeZone={membership.organization.timeZone}
          error={query.error}
          messages={messages}
          allowOpenShifts={membership.organization.allowOpenShifts}
        />
      )}
    </>
  );
}
