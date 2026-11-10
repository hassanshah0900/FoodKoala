/** Grey cards in the shape of the list while the search answers. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6 px-4 py-6" aria-busy="true">
      <span className="sr-only">Loading restaurants</span>
      <div className="h-12 rounded-full bg-canvas" />
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders never reorder.
          <div key={i} className="space-y-2">
            <div className="aspect-[16/9] rounded-lg bg-canvas" />
            <div className="h-4 w-2/3 rounded bg-canvas" />
            <div className="h-3 w-1/2 rounded bg-canvas" />
          </div>
        ))}
      </div>
    </div>
  );
}
