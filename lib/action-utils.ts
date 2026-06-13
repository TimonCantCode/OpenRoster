import { redirect } from "next/navigation";

export function redirectWithMessage(
  path: string,
  type: "error" | "success",
  message: string,
): never {
  const params = new URLSearchParams({ [type]: message });
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${params.toString()}`);
}

export function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}
