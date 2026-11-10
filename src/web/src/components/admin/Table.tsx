/** A white card holding a table, with a line instead when there are no rows. */
export function Table({
  columns,
  empty,
  children,
}: {
  columns: string[];
  /** Shown instead of the table when there are no rows. */
  empty: string | null;
  children: React.ReactNode;
}) {
  if (empty) return <p className="rounded-xl bg-white px-6 py-16 text-center text-muted shadow-sm">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs tracking-wide text-muted uppercase">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}
