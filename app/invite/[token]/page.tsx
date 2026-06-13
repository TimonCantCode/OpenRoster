import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { acceptInviteAction } from "@/server/actions/invites";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const messages = await searchParams;
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: true },
  });

  if (!invite) notFound();
  const invalid = Boolean(invite.acceptedAt || invite.expiresAt <= new Date());

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            Invitation to {invite.organization.name}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Set up your account to join the team.
          </p>
        </div>
        <Card>
          {invalid ? (
            <Message error="This invitation has expired or has already been used." />
          ) : (
            <form action={acceptInviteAction} className="grid gap-4">
              <Message error={messages.error} />
              <input type="hidden" name="token" value={token} />
              <Field label="Email">
                <Input value={invite.email} disabled />
              </Field>
              <Field label="Your name">
                <Input
                  name="name"
                  defaultValue={invite.name ?? ""}
                  autoComplete="name"
                  required
                />
              </Field>
              <Field
                label="Password"
                hint="At least 12 characters. Use your existing password if an account already exists."
              >
                <Input
                  name="password"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Button type="submit">Accept invitation</Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
