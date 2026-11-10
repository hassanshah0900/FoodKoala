'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { addToCart } from '@/app/cart/actions';
import type { MenuItem } from '@/lib/api/types';
import { groupRule, toggle, unitPrice, unmetGroups } from '@/lib/choices';
import { rupees } from '@/lib/format';

/**
 * The item's choices, a note for the kitchen and how many: the sheet that
 * opens from a menu card. Asks before replacing another restaurant's cart.
 */
export function ItemSheet({
  item,
  restaurantId,
  onClose,
}: {
  item: MenuItem;
  restaurantId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [askReplace, setAskReplace] = useState(false);
  const [adding, startAdding] = useTransition();

  useEffect(() => dialog.current?.showModal(), []);

  const unmet = unmetGroups(item, selected);
  const total = unitPrice(item, selected) * quantity;

  const add = (replace: boolean) =>
    startAdding(async () => {
      setError(null);
      const result = await addToCart({
        restaurantId,
        itemId: item.id,
        quantity,
        optionIds: selected,
        note: note.trim() || null,
        replace,
      });
      if ('ok' in result) onClose();
      else if ('signIn' in result) router.push(result.signIn);
      else if ('otherRestaurant' in result) setAskReplace(true);
      else setError(result.error);
    });

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the backdrop closes it; keyboards close a <dialog> with Escape.
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl p-0 backdrop:bg-black/50"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="overflow-y-auto">
          {item.imageUrl && (
            // biome-ignore lint/performance/noImgElement: menu photos come from any host restaurants upload to.
            <img src={item.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
          )}
          <div className="space-y-1 p-6 pb-2">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-extrabold">{item.name}</h2>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                aria-label="Close"
                className="-mt-1 -mr-2 rounded-full p-2 text-2xl leading-none text-muted hover:bg-canvas"
              >
                ×
              </button>
            </div>
            <p className="font-semibold">{rupees(item.pricePaisa)}</p>
            {item.description && <p className="text-sm text-muted">{item.description}</p>}
          </div>

          {item.optionGroups.map((g) => {
            const single = g.maxSelect === 1;
            const required = g.minSelect > 0;
            return (
              <fieldset key={g.id} className="border-t border-line px-6 py-4">
                <legend className="sr-only">{g.name}</legend>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-bold">{g.name}</p>
                    <p className="text-xs text-muted">{groupRule(g)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      !required
                        ? 'bg-canvas text-muted'
                        : unmet.includes(g.id)
                          ? 'bg-brand-600 text-white'
                          : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    {required ? (unmet.includes(g.id) ? 'Required' : 'Done') : 'Optional'}
                  </span>
                </div>
                {g.options.map((o) => (
                  <label
                    key={o.id}
                    className={`flex items-center gap-3 py-2 text-sm ${o.isAvailable ? 'cursor-pointer' : 'opacity-50'}`}
                  >
                    <input
                      type={single ? 'radio' : 'checkbox'}
                      name={g.id}
                      checked={selected.includes(o.id)}
                      disabled={!o.isAvailable}
                      onChange={() => setSelected((s) => toggle(item, o.id, s))}
                      className="size-4.5 accent-brand-600"
                    />
                    <span className="flex-1">{o.name}</span>
                    <span className="text-muted">
                      {!o.isAvailable ? 'Sold out' : o.pricePaisa ? `+ ${rupees(o.pricePaisa)}` : ''}
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })}

          <label className="block border-t border-line px-6 py-4">
            <span className="font-bold">Special instructions</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="e.g. no onions, extra spicy"
              className="mt-2 w-full resize-none rounded-lg border border-line p-3 text-sm outline-none focus:border-brand-600"
            />
          </label>
        </div>

        <div className="space-y-3 border-t border-line p-4">
          {askReplace && (
            <div className="rounded-lg bg-brand-50 p-3 text-sm">
              <p className="font-bold">Start a new cart?</p>
              <p className="mt-0.5 text-muted">
                Your cart has items from another restaurant. Adding this will remove them.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => add(true)}
                  disabled={adding}
                  className="rounded-lg bg-brand-600 px-4 py-2 font-bold text-white hover:bg-brand-700"
                >
                  New cart
                </button>
                <button
                  type="button"
                  onClick={() => setAskReplace(false)}
                  className="rounded-lg px-4 py-2 font-semibold text-brand-700 hover:bg-brand-100"
                >
                  Keep my cart
                </button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-line">
              <button
                type="button"
                aria-label="One fewer"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity === 1}
                className="size-10 rounded-full text-xl font-bold text-brand-600 disabled:text-neutral-300"
              >
                −
              </button>
              <span className="w-6 text-center font-bold" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="One more"
                onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                className="size-10 rounded-full text-xl font-bold text-brand-600"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => add(false)}
              disabled={unmet.length > 0 || adding || askReplace}
              className="h-12 flex-1 rounded-lg bg-brand-600 font-bold text-white hover:bg-brand-700 disabled:bg-neutral-300"
            >
              {adding ? 'Adding…' : `Add to cart · ${rupees(total)}`}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
