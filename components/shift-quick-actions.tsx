import { Pencil, UserPlus } from "lucide-react";
import Link from "next/link";
import type { AppMessages } from "@/lib/i18n";
import { assignMemberToShiftAction } from "@/server/actions/shifts";

export function ShiftQuickActions({
  shiftId,
  employees,
  returnTo,
  messages,
  compact = false,
  canAssign = true,
}: {
  shiftId: string;
  employees: Array<{ id: string; name: string }>;
  returnTo: string;
  messages: AppMessages;
  compact?: boolean;
  canAssign?: boolean;
}) {
  return (
    <div
      className={`flex gap-2 ${compact ? "flex-col items-stretch" : "flex-wrap items-center justify-end"}`}
    >
      {canAssign ? (
        <details
          className={`group relative ${compact ? "w-full" : ""} [&>summary::-webkit-details-marker]:hidden`}
        >
          <summary
            className={`inline-flex min-h-9 cursor-pointer list-none items-center justify-center gap-1 rounded-lg bg-[#136f63] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[#0d564d] ${compact ? "w-full" : ""}`}
          >
            <UserPlus className="size-3.5" />
            {messages.assign}
          </summary>
          <div
            className={`absolute z-30 mt-2 rounded-xl border bg-white p-2 text-sm shadow-xl ring-1 ring-black/5 ${
              compact ? "left-0 w-full min-w-36" : "right-0 min-w-52"
            }`}
          >
            {employees.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">
                {messages.noAvailableEmployees}
              </p>
            ) : (
              <form action={assignMemberToShiftAction} className="grid gap-1">
                <input type="hidden" name="shiftId" value={shiftId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                {employees.map((employee) => (
                  <button
                    key={employee.id}
                    type="submit"
                    name="membershipId"
                    value={employee.id}
                    className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-[#136f63] focus:bg-emerald-50 focus:outline-none"
                  >
                    {employee.name}
                  </button>
                ))}
              </form>
            )}
          </div>
        </details>
      ) : null}
      <Link
        href={`/app/schedule/${shiftId}/edit`}
        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#136f63] hover:bg-emerald-50"
      >
        <Pencil className="size-3.5" /> {messages.edit}
      </Link>
    </div>
  );
}
