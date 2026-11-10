'use client';

import { useEffect, useRef, useState } from 'react';

/** Sticky category tabs; the one being read is underlined as the menu scrolls past. */
export function MenuNav({ categories }: { categories: { id: string; name: string }[] }) {
  const [active, setActive] = useState<string | undefined>(categories[0]?.id);
  const tabs = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Each callback reports only the sections that changed, so remember them all.
    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id.replace('category-', '');
          if (e.isIntersecting) inBand.add(id);
          else inBand.delete(id);
        }
        const first = categories.find((c) => inBand.has(c.id));
        if (first) setActive(first.id);
      },
      // A section counts as read while it crosses the band just under the sticky bars.
      { rootMargin: '-140px 0px -60% 0px' },
    );
    for (const c of categories) {
      const el = document.getElementById(`category-${c.id}`);
      if (el) observer.observe(el);
    }
    // The last sections may never reach that band; at the bottom of the page the last one is being read.
    const atBottom = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2)
        setActive(categories.at(-1)?.id);
    };
    window.addEventListener('scroll', atBottom, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', atBottom);
    };
  }, [categories]);

  useEffect(() => {
    tabs.current?.querySelector(`[data-id="${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  if (categories.length < 2) return null;
  return (
    <div className="sticky top-16 z-20 -mx-4 border-b border-line bg-white px-4">
      <div ref={tabs} className="no-scrollbar flex gap-6 overflow-x-auto">
        {categories.map((c) => (
          <a
            key={c.id}
            data-id={c.id}
            href={`#category-${c.id}`}
            className={`shrink-0 border-b-2 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
              active === c.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>
    </div>
  );
}
