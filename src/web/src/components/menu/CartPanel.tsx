import { BagIcon } from '@/components/icons';

/** The cart beside the menu. Empty for now: ordering arrives with signing in. */
export function CartPanel() {
  return (
    <aside className="sticky top-24 hidden h-fit w-[340px] shrink-0 rounded-xl border border-line p-6 shadow-sm lg:block">
      <h2 className="text-lg font-bold">Your cart</h2>
      <div className="flex flex-col items-center py-10 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <BagIcon className="size-10" />
        </span>
        <p className="mt-4 font-bold">Hungry?</p>
        <p className="mt-1 text-sm text-muted">You haven't added anything to your cart yet.</p>
      </div>
    </aside>
  );
}
