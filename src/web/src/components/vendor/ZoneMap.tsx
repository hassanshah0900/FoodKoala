import type { DeliveryZone, Point } from '@/lib/api/types';
import { farthest, offset } from '@/lib/zones';

const SIZE = 320;
const SHADES = ['#7a1fb3', '#a35fdb', '#c193e8', '#4f1673', '#8b35cc'];

/** The zones drawn around the restaurant to scale, with distance rings; widest drawn first so all show. */
export function ZoneMap({ zones, center }: { zones: DeliveryZone[]; center: Point }) {
  const reach = farthest(zones, center);
  const scale = (SIZE / 2 - 12) / reach;
  const xy = (p: [number, number]) => {
    const [east, north] = offset(center, p);
    return `${(SIZE / 2 + east * scale).toFixed(1)},${(SIZE / 2 - north * scale).toFixed(1)}`;
  };
  const sorted = [...zones].sort((a, b) => farthest([b], center) - farthest([a], center));
  // A ring every km, or every 2 km once zones reach far enough that 1 km rings would crowd.
  const step = reach > 6000 ? 2 : 1;
  const rings = Array.from({ length: Math.floor(reach / 1000 / step) }, (_, i) => (i + 1) * step);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Delivery zones around the restaurant"
      className="w-full max-w-xs rounded-xl bg-canvas"
    >
      {rings.map((km) => (
        <circle
          key={km}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={km * 1000 * scale}
          fill="none"
          stroke="#d4d4d4"
          strokeDasharray="2 4"
        />
      ))}
      {sorted.map((z, i) => (
        <polygon
          key={z.id}
          points={z.area.coordinates[0].map(xy).join(' ')}
          fill={SHADES[i % SHADES.length]}
          fillOpacity={0.18}
          stroke={SHADES[i % SHADES.length]}
          strokeWidth={1.5}
        >
          <title>{z.name}</title>
        </polygon>
      ))}
      <circle cx={SIZE / 2} cy={SIZE / 2} r={5} fill="#7a1fb3" stroke="white" strokeWidth={2} />
      <text x={SIZE - 8} y={SIZE - 8} textAnchor="end" fontSize={10} fill="#707070">
        rings every {step} km
      </text>
    </svg>
  );
}
