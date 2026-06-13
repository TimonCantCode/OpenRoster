import { formatMinutes } from "@/lib/utils";
import type { AppMessages } from "@/lib/i18n";

export function HoursBalance({
  workedMinutes,
  targetMinutes,
  balanceMinutes,
  messages,
}: {
  workedMinutes: number;
  targetMinutes: number;
  balanceMinutes: number;
  messages: AppMessages;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label={messages.worked} value={formatMinutes(workedMinutes)} />
      <Metric label={messages.target} value={formatMinutes(targetMinutes)} />
      <Metric
        label={messages.balance}
        value={`${balanceMinutes > 0 ? "+" : ""}${formatMinutes(balanceMinutes)}`}
        accent={balanceMinutes >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative";
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold ${
          accent === "positive"
            ? "text-emerald-700"
            : accent === "negative"
              ? "text-red-700"
              : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
