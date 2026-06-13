import type { ButtonHTMLAttributes } from "react";

export const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-[#136f63] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0d564d] focus:outline-none focus:ring-2 focus:ring-[#136f63]/30 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${buttonClass} ${className}`} {...props} />;
}
