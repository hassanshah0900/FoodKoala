/**
 * Paisa from what an admin types in rupees: "1172", "1,172.50" or "Rs 500".
 * Null for anything else, or for more than two decimals.
 */
export function paisaFrom(rupees: string): number | null {
  const text = rupees
    .replace(/^\s*rs\.?\s*/i, '')
    .replaceAll(',', '')
    .trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Paisa as a rupee amount for a form field: 117250 → "1172.50", 50000 → "500". */
export const rupeesField = (paisa: number) => (paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2));
