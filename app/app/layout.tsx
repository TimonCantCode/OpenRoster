import { AppSidebar } from "@/components/app-sidebar";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMessages } from "@/lib/i18n";

export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const membership = await requireMembership();
  const messages = getMessages(membership.user.language);
  const organizations = await prisma.membership.findMany({
    where: { userId: membership.userId, isActive: true },
    select: { organization: { select: { id: true, name: true } } },
    orderBy: { organization: { name: "asc" } },
  });

  return (
    <div className="min-h-screen">
      <AppSidebar
        role={membership.role}
        organizationName={membership.organization.name}
        organizationId={membership.organizationId}
        organizations={organizations.map((item) => item.organization)}
        userName={membership.user.name}
        messages={messages}
      />
      <main className="px-5 py-7 lg:ml-64 lg:px-8 lg:py-9">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
