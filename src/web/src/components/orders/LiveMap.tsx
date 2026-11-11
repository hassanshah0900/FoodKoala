'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useEffect, useRef } from 'react';
import { drawMap, type Leaflet, loadLeaflet } from '@/components/map/osm';
import type { mapPins } from '@/lib/tracking';

type Pin = ReturnType<typeof mapPins>[number];

/** The map as drawn: Leaflet, the map and a marker per kind of pin. */
interface Drawn {
  L: Leaflet;
  map: LeafletMap;
  markers: Map<Pin['kind'], Marker>;
}

const PIN_HTML: Record<Pin['kind'], string> = {
  restaurant:
    '<span class="grid size-9 place-items-center rounded-full bg-white text-lg shadow-md ring-2 ring-brand-600">🍽️</span>',
  home: '<span class="grid size-9 place-items-center rounded-full bg-white text-lg shadow-md ring-2 ring-neutral-800">🏠</span>',
  rider:
    '<span class="grid size-11 place-items-center rounded-full bg-brand-600 text-xl shadow-lg ring-4 ring-brand-200">🛵</span>',
};

/** Moves the markers to the pins; fits them all in view the first time and whenever one is off screen. */
function place({ L, map, markers }: Drawn, pins: Pin[], first: boolean) {
  if (pins.length === 0) return;
  for (const [kind, marker] of markers) {
    if (!pins.some((p) => p.kind === kind)) {
      marker.remove();
      markers.delete(kind);
    }
  }
  for (const p of pins) {
    const existing = markers.get(p.kind);
    if (existing) existing.setLatLng(p.at);
    else {
      const icon = L.divIcon({ html: PIN_HTML[p.kind], className: '', iconSize: [44, 44], iconAnchor: [22, 22] });
      markers.set(p.kind, L.marker(p.at, { icon, zIndexOffset: p.kind === 'rider' ? 1000 : 0 }).addTo(map));
    }
  }
  const bounds = L.latLngBounds(pins.map((p) => p.at));
  if (first || !map.getBounds().contains(bounds)) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
}

/** An OpenStreetMap map with the order's pins; it follows the rider as they move. */
export function LiveMap({ pins }: { pins: Pin[] }) {
  const box = useRef<HTMLDivElement>(null);
  const drawn = useRef<Drawn | null>(null);
  // The pins as of now, for the map that finishes loading after the first render.
  const current = useRef(pins);
  current.current = pins;

  // Drawn once; later pins arrive through the effect below.
  useEffect(() => {
    let gone = false;
    loadLeaflet().then((L) => {
      if (gone || !box.current) return;
      drawn.current = { L, map: drawMap(L, box.current), markers: new Map() };
      place(drawn.current, current.current, true);
    });
    return () => {
      gone = true;
      drawn.current?.map.remove();
      drawn.current = null;
    };
  }, []);

  useEffect(() => {
    if (drawn.current) place(drawn.current, pins, false);
  }, [pins]);

  return <div ref={box} className="isolate h-72 w-full overflow-hidden rounded-xl bg-neutral-100 md:h-96" />;
}
