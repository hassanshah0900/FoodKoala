/** How cuisine tags (lower-case, kebab-case) are shown: a picture and, where words alone get it wrong, a label. */
const KNOWN: Record<string, { emoji: string; label?: string }> = {
  pakistani: { emoji: '🍛' },
  biryani: { emoji: '🍛' },
  karahi: { emoji: '🥘' },
  nihari: { emoji: '🍲' },
  bbq: { emoji: '🍢', label: 'BBQ' },
  burgers: { emoji: '🍔' },
  'fast-food': { emoji: '🍟' },
  pizza: { emoji: '🍕' },
  italian: { emoji: '🍝' },
  chinese: { emoji: '🥡' },
  shawarma: { emoji: '🌯' },
  lebanese: { emoji: '🥙' },
  chai: { emoji: '☕' },
  breakfast: { emoji: '🍳' },
  desserts: { emoji: '🍰' },
  'ice-cream': { emoji: '🍨' },
  bakery: { emoji: '🥐' },
  seafood: { emoji: '🦐' },
  sandwiches: { emoji: '🥪' },
  healthy: { emoji: '🥗' },
  drinks: { emoji: '🥤' },
};

/** "fast-food" → "Fast food", "bbq" → "BBQ". */
export function cuisineLabel(tag: string): string {
  const known = KNOWN[tag]?.label;
  if (known) return known;
  const words = tag.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A food picture for the tag, or null for cuisines we have none for. */
export const cuisineEmoji = (tag: string): string | null => KNOWN[tag]?.emoji ?? null;
