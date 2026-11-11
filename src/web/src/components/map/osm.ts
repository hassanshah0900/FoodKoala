import type { Map as LeafletMap } from 'leaflet';

export type Leaflet = typeof import('leaflet');

/** Leaflet touches `window` when it loads, so maps import it in the browser only, through this. */
export const loadLeaflet = (): Promise<Leaflet> => import('leaflet');

/** A map in `box` with OpenStreetMap tiles, their attribution and zoom buttons at the bottom right; it follows the box's size. */
export function drawMap(L: Leaflet, box: HTMLElement): LeafletMap {
  const map = L.map(box, { zoomControl: false });
  const resized = new ResizeObserver(() => map.invalidateSize({ pan: false }));
  resized.observe(box);
  map.on('unload', () => resized.disconnect());
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  return map;
}

/**
 * Calls `draw` once `box` has a size, e.g. when the closed <details> around it is opened: a map
 * drawn in a hidden box can't tell where its centre is. Returns a cleanup that stops waiting.
 */
export function whenVisible(box: HTMLElement, draw: () => void): () => void {
  const seen = new ResizeObserver(() => {
    if (box.clientWidth === 0 || box.clientHeight === 0) return;
    seen.disconnect();
    draw();
  });
  seen.observe(box);
  return () => seen.disconnect();
}
