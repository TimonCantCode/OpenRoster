import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { ShiftForm } from "@/components/shift-form";
import { Button } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMessages } from "@/lib/i18n";
import {
  deleteShiftAction,
  updateShiftAction,
} from "@/server/actions/shifts";

export default async function EditShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const membership = await requireMembership([Role.OWNER, Role.ADMIN]);
  const { id } = await params;
  const query = await searchParams;
  const messages = getMessages(membership.user.language);
  const [shift, members] = await Promise.all([
    prisma.shift.findFirst({
      where: { id, organizationId: membership.organizationId },
      include: { assignments: true },
    }),
    prisma.membership.findMany({
      where: { organizationId: membership.organizationId, isActive: true },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  if (!shift) notFound();

  return (
    <>
      <PageHeading
        title={messages.editShift}
        description={`${messages.timeZoneHint} ${membership.organization.timeZone}.`}
      />
      <ShiftForm
        action={updateShiftAction}
        members={members}
        timeZone={membership.organization.timeZone}
        shift={shift}
        error={query.error}
        messages={messages}
        allowOpenShifts={membership.organization.allowOpenShifts}
      />
      <form action={deleteShiftAction} className="mt-5 max-w-3xl">
        <input type="hidden" name="shiftId" value={shift.id} />
        <Button
          type="submit"
          className="bg-red-700 hover:bg-red-800 focus:ring-red-300"
        >
          {messages.deleteShift}
        </Button>
      </form>
    </>
  );
}
