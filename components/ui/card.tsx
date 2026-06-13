export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-5 shadow-[0_10px_30px_rgba(24,32,30,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}
