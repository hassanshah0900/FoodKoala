/** One headline figure, and how it moved against the period before (green when the move is good). */
export function StatTile({
  label,
  value,
  delta,
  upIsGood = true,
  note,
}: {
  label: string;
  value: string;
  /** Percent change from the previous period; null when there is nothing to compare with. */
  delta?: number | null;
  upIsGood?: boolean;
  note?: string;
}) {
  const good = delta !== null && delta !== undefined && delta !== 0 && delta > 0 === upIsGood;
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {delta !== undefined && (
        <p
          className={`mt-1 text-xs font-semibold ${delta === null || delta === 0 ? 'text-muted' : good ? 'text-green-700' : 'text-red-700'}`}
        >
          {delta === null
            ? 'Nothing to compare with'
            : delta === 0
              ? 'Same as the period before'
              : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% on the period before`}
        </p>
      )}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
