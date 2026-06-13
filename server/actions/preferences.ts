"use server";

import { Language } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString } from "@/lib/action-utils";
import { requireMembership, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function updateLanguageAction(formData: FormData) {
  const user = await requireUser();
  const value = formString(formData, "language");
  if (value !== Language.EN && value !== Language.DE) {
    redirect("/app/settings?error=Invalid+language");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { language: value },
  });

  revalidatePath("/app", "layout");
  redirect(
    `/app/settings?success=${
      value === Language.DE
        ? "Sprache+aktualisiert"
        : "Language+updated"
    }`,
  );
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const membership = await requireMembership();
  const notifyShiftChanges = formData.get("notifyShiftChanges") === "true";

  await prisma.membership.update({
    where: { id: membership.id },
    data: { notifyShiftChanges },
  });

  revalidatePath("/app", "layout");
  redirect("/app/settings?success=Notification+preferences+updated");
}
