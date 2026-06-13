import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-bold tracking-tight">
      <span className="grid size-9 place-items-center rounded-xl bg-[#136f63] text-white">
        OR
      </span>
      <span className="text-lg">OpenRoster</span>
    </Link>
  );
}
