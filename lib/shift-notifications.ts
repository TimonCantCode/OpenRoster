import { ShiftStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { sendShiftChangeEmail } from "@/lib/mail";

export function getShiftNotificationLines(params: {
  title: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
}) {
  return [
    params.title,
    `${formatInTimeZone(params.startTime, params.timeZone, "yyyy-MM-dd HH:mm")} - ${formatInTimeZone(
      params.endTime,
      params.timeZone,
      "HH:mm",
    )}`,
  ];
}

export async function notifyAssignedMembers(params: {
  organizationId: string;
  shiftId: string;
  subject: string;
  lines: string[];
}) {
  const shift = await prisma.shift.findFirst({
    where: { id: params.shiftId, organizationId: params.organizationId },
    include: {
      organization: true,
      assignments: {
        include: {
          membership: { include: { user: true } },
        },
      },
    },
  });
  if (!shift || shift.status !== ShiftStatus.PUBLISHED) return;

  await Promise.all(
    shift.assignments
      .filter((assignment) => assignment.membership.notifyShiftChanges)
      .map((assignment) =>
        sendShiftChangeEmail({
          email: assignment.membership.user.email,
          organizationName: shift.organization.name,
          subject: params.subject,
          lines: params.lines,
        }),
      ),
  );
}
