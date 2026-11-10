import type { Address } from './api/types';

/** "Home", "Work", or the customer's own name for it. */
export const addressTitle = (a: Pick<Address, 'label' | 'labelText'>) =>
  a.labelText ?? a.label.charAt(0).toUpperCase() + a.label.slice(1);

/** "House 7, Block 13, Gulshan-e-Iqbal, Karachi". */
export const addressLine = (a: Pick<Address, 'line1' | 'area' | 'city'>) => `${a.line1}, ${a.area}, ${a.city}`;

/** The area and city a preset location's label names ("Gulberg, Lahore"), to start a new address with. */
export function areaAndCity(label: string): { area: string; city: string } {
  const parts = label.split(',').map((p) => p.trim());
  return parts.length === 2 ? { area: parts[0], city: parts[1] } : { area: '', city: '' };
}
