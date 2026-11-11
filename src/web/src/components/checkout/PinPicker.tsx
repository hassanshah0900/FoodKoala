'use client';

import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { CrosshairIcon, SearchIcon } from '@/components/icons';
import { drawMap, loadLeaflet, whenVisible } from '@/components/map/osm';
import type { Point } from '@/lib/api/types';
import { MIN_QUERY, type Place } from '@/lib/places';

/** Close enough to tell one house from the next. */
const DOOR_ZOOM = 17;

const PIN_HTML =
  '<span class="grid size-10 place-items-center rounded-full bg-brand-600 text-lg shadow-lg ring-4 ring-brand-200">🏠</span>';

/**
 * Where the rider should go: a map with a pin the customer drags (or taps) to their door, a search
 * for a street or block, and "Use my location". The pin goes with the form as `lat` and `lng`.
 */
export function PinPicker({ start }: { start: Point }) {
  const [pin, setPin] = useState(start);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: LeafletMap; marker: Marker } | null>(null);
  const first = useRef(start);

  useEffect(() => {
    let gone = false;
    const stopWaiting = box.current
      ? whenVisible(box.current, () =>
          loadLeaflet().then((L) => {
            if (gone || !box.current) return;
            const m = drawMap(L, box.current).setView(first.current, DOOR_ZOOM - 1);
            const icon = L.divIcon({ html: PIN_HTML, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
            const marker = L.marker(first.current, { icon, draggable: true, autoPan: true }).addTo(m);
            marker.on('dragend', () => setPin(marker.getLatLng()));
            m.on('click', (e) => setPin(e.latlng));
            map.current = { map: m, marker };
          }),
        )
      : undefined;
    return () => {
      gone = true;
      stopWaiting?.();
      map.current?.map.remove();
      map.current = null;
    };
  }, []);

  // Follow the pin wherever it was set from: a drag, a tap, a search or the phone's location.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.marker.setLatLng(pin);
    if (!m.map.getBounds().pad(-0.2).contains(pin)) m.map.setView(pin, Math.max(m.map.getZoom(), DOOR_ZOOM - 1));
  }, [pin]);

  const moveTo = (p: Point) => {
    setPin({ lat: p.lat, lng: p.lng });
    map.current?.map.setView(p, DOOR_ZOOM);
  };

  const search = async () => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;
    setNote(null);
    const res = await fetch(`/places?q=${encodeURIComponent(q)}`).catch(() => null);
    const found = res?.ok ? ((await res.json()) as Place[]) : [];
    setPlaces(found);
    if (!found.length) setNote('Nothing found. Try a block or a well-known place nearby, or move the pin yourself.');
  };

  const locate = () => {
    setNote(null);
    if (!('geolocation' in navigator)) return setNote('Your browser cannot share your location.');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => moveTo({ lat: coords.latitude, lng: coords.longitude }),
      () => setNote('We could not get your location. Move the pin yourself.'),
      { timeout: 10_000, enableHighAccuracy: true },
    );
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex gap-2">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-line px-3 focus-within:border-brand-600">
          <SearchIcon className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Search for your street or block</span>
          {/* No name: it only moves the pin, it isn't part of the address. Enter searches instead of saving. */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search();
              }
            }}
            placeholder="Search for your street or block"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <button
          type="button"
          onClick={search}
          className="rounded-lg border border-line px-4 text-sm font-semibold hover:border-brand-600"
        >
          Search
        </button>
      </div>
      {places && places.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {places.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button
                type="button"
                onClick={() => {
                  moveTo(p);
                  setPlaces(null);
                }}
                className="w-full px-3 py-2 text-left hover:bg-brand-50"
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* isolate: Leaflet's layers stack high, and must stay under the page header. */}
      <div className="relative isolate">
        <div ref={box} className="h-64 w-full overflow-hidden rounded-lg bg-neutral-100" />
        <button
          type="button"
          onClick={locate}
          className="absolute top-2 left-2 z-[1000] flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-md"
        >
          <CrosshairIcon className="size-4" /> Use my location
        </button>
      </div>
      <p className="text-xs text-muted">{note ?? 'Drag the pin to your door, or tap the map where it is.'}</p>
      <input type="hidden" name="lat" value={pin.lat.toFixed(6)} />
      <input type="hidden" name="lng" value={pin.lng.toFixed(6)} />
    </div>
  );
}
