import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import { registerAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Create organization" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const messages = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 sm:px-5 sm:py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <Logo />
          <h1 className="mt-5 text-2xl font-bold tracking-tight sm:mt-6 sm:text-3xl">
            Set up OpenRoster
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Create the first owner and your organization.
          </p>
        </div>
        <Card>
          <form action={registerAction} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Message error={messages.error} />
            </div>
            <Field label="Your name">
              <Input name="name" autoComplete="name" required />
            </Field>
            <Field label="Organization">
              <Input name="organizationName" required />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Email">
                <Input name="email" type="email" autoComplete="email" required />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Password" hint="At least 12 characters">
                <Input
                  name="password"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                />
              </Field>
            </div>
            <Button type="submit" className="mt-2 sm:col-span-2">
              Create organization
            </Button>
          </form>
        </Card>
        <p className="mt-5 text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link href="/auth/login" className="font-semibold text-[#136f63]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
