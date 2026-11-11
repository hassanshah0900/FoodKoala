'use client';

import { useState } from 'react';
import type { MenuItem } from '@/lib/api/types';
import { ItemSheet } from './ItemSheet';
import { MenuItemCard } from './MenuItemCard';

/** A menu card that opens its item sheet when tapped, unless the item is sold out. */
export function AddableItem({ item, restaurantId }: { item: MenuItem; restaurantId: string }) {
  const [open, setOpen] = useState(false);
  if (!item.isAvailable) return <MenuItemCard item={item} />;
  return (
    <>
      {/* Named outright: a button's name isn't taken from the card's article, so it would be read as just "button". */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left"
        aria-haspopup="dialog"
        aria-label={`Add ${item.name}`}
      >
        <MenuItemCard item={item} addable />
      </button>
      {open && <ItemSheet item={item} restaurantId={restaurantId} onClose={() => setOpen(false)} />}
    </>
  );
}
