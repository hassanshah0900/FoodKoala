'use client';

import { useState } from 'react';
import type { SalesReport } from '@/lib/api/types';
import { rupees } from '@/lib/format';
import { axisRupees, ticks } from '@/lib/reports';

const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 64 };

const dayLabel = (date: string, long = false) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(long && { weekday: 'short' }),
    timeZone: 'UTC',
  });

/** Each day's sales as columns from one baseline; hovering or focusing a day shows its figures. */
export function SalesChart({ days }: { days: SalesReport['days'] }) {
  const [active, setActive] = useState<number | null>(null);
  const yTicks = ticks(Math.max(...days.map((d) => d.salesPaisa), 0));
  const top = yTicks.at(-1) || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / days.length;
  // Columns stay thin (18 units is about 24px at the usual width) with a gap, so neighbours never touch.
  const barW = Math.max(1, Math.min(18, band - 2));
  const y = (paisa: number) => PAD.top + plotH - (paisa / top) * plotH;
  const labelEvery = Math.ceil(days.length / 8);
  const shown = active === null ? null : days[active];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sales each day">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e9e9e9" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#707070">
              {axisRupees(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = PAD.left + i * band + (band - barW) / 2;
          const h = PAD.top + plotH - y(d.salesPaisa);
          const r = Math.min(4, barW / 2, h);
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group is the column; the table below the chart carries the same figures.
            <g
              key={d.date}
              role="button"
              tabIndex={0}
              aria-label={`${dayLabel(d.date)}: ${rupees(d.salesPaisa)}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="outline-none"
            >
              {/* The hit area is the whole day's band, taller and wider than the column. */}
              <rect x={PAD.left + i * band} y={PAD.top} width={band} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  // Rounded at the top only; square where it meets the baseline.
                  d={`M${x},${y(0)} V${y(d.salesPaisa) + r} q0,-${r} ${r},-${r} H${x + barW - r} q${r},0 ${r},${r} V${y(0)} Z`}
                  fill="#7a1fb3"
                  fillOpacity={active === null || active === i ? 1 : 0.45}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={PAD.left + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#707070">
                  {dayLabel(d.date)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#d4d4d4" strokeWidth={1} />
      </svg>
      {shown && active !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-line bg-white px-3 py-2 text-xs whitespace-nowrap shadow-lg"
          style={{
            left: `${((PAD.left + (active + 0.5) * band) / W) * 100}%`,
            transform: `translateX(${active > days.length / 2 ? '-100%' : '0'})`,
          }}
        >
          <p className="font-semibold">{dayLabel(shown.date, true)}</p>
          <p>{rupees(shown.salesPaisa)} sales</p>
          <p className="text-muted">
            {shown.delivered} delivered of {shown.placed} placed
          </p>
        </div>
      )}
    </div>
  );
}
