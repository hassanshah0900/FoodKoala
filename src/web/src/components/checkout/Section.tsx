/** A numbered white card, as each checkout step is shown. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}
