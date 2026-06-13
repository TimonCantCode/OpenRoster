export function Message({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  const message = error ?? success;
  if (!message) return null;

  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {message}
    </div>
  );
}
