import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Message } from "@/components/ui/message";
import { loginAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const messages = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to your organization.
          </p>
        </div>
        <Card>
          <form action={loginAction} className="grid gap-4">
            <Message error={messages.error} success={messages.success} />
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Button type="submit" className="mt-2 w-full">
              Sign in
            </Button>
          </form>
        </Card>
        <p className="mt-5 text-center text-sm text-slate-500">
          No organization yet?{" "}
          <Link href="/auth/register" className="font-semibold text-[#136f63]">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
