import type { AppMessages } from "@/lib/i18n";

export function WeekdaySelector({
  name,
  selected,
  messages,
  disabled = false,
  allowed,
}: {
  name: string;
  selected: number[];
  messages: AppMessages;
  disabled?: boolean;
  allowed?: number[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {messages.weekdaysShort.map((label, index) => {
        const value = index + 1;
        const isDisabled = disabled || (allowed ? !allowed.includes(value) : false);
        return (
          <label
            key={label}
            className={isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}
          >
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={selected.includes(value)}
              disabled={isDisabled}
              className="peer sr-only"
            />
            <span className="grid size-11 place-items-center rounded-full border bg-white text-xs font-semibold text-slate-600 shadow-sm peer-checked:border-[#136f63] peer-checked:bg-[#136f63] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#136f63]/30">
              {label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
