export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-4 shadow-[0_10px_30px_rgba(24,32,30,0.04)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}
