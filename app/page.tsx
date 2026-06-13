import {
  ArrowRight,
  CalendarCheck,
  Clock3,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClass, secondaryButtonClass } from "@/components/ui/button";

const features = [
  {
    icon: CalendarCheck,
    title: "Plan shifts clearly",
    text: "Weekly schedule and list view without unnecessary complexity.",
  },
  {
    icon: Users,
    title: "Manage teams",
    text: "Owner, admin and employee roles with email invitations.",
  },
  {
    icon: Clock3,
    title: "Track hours",
    text: "Targets, worked time, breaks and adjustments calculated transparently.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-tenant by design",
    text: "Every request is checked against organization membership and role.",
  },
  {
    icon: Server,
    title: "Self-hostable",
    text: "Run Next.js and PostgreSQL together with Docker Compose.",
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Logo />
        <div className="flex gap-2">
          <Link href="/auth/login" className={secondaryButtonClass}>
            Sign in
          </Link>
          <Link href="/auth/register" className={buttonClass}>
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
            Open source · Self-hostable · SaaS-ready
          </span>
          <h1 className="mt-6 max-w-3xl text-5xl font-bold tracking-[-0.04em] text-slate-900 sm:text-6xl">
            Shift scheduling your team understands.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Plan shifts, invite employees and keep hour balances under
            control. Without overloaded enterprise software.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/auth/register" className={`${buttonClass} gap-2`}>
              Create organization <ArrowRight className="size-4" />
            </Link>
            <a
              href="https://github.com/"
              className={secondaryButtonClass}
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="rounded-3xl border bg-slate-900 p-3 shadow-2xl shadow-emerald-950/15">
          <div className="rounded-2xl bg-white p-5">
            <p className="text-sm font-semibold text-slate-500">This week</p>
            <h2 className="mt-1 text-2xl font-bold">Team schedule</h2>
            <div className="mt-5 grid gap-3">
              {[
                ["Mon", "08:00 – 16:30", "Early shift", "Lea, Jonas"],
                ["Tue", "12:00 – 20:00", "Late shift", "Mira, Jonas"],
                ["Wed", "09:00 – 17:00", "Workshop", "Lea"],
              ].map(([day, time, title, team]) => (
                <div
                  key={day}
                  className="grid grid-cols-[3rem_1fr] gap-3 rounded-xl border p-3"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-800">
                    {day}
                  </span>
                  <div>
                    <div className="flex justify-between gap-4">
                      <strong>{title}</strong>
                      <span className="text-sm text-slate-500">{time}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{team}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-16 sm:grid-cols-2 lg:grid-cols-5">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-2xl p-4">
              <feature.icon className="size-6 text-[#136f63]" />
              <h2 className="mt-4 font-bold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {feature.text}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
