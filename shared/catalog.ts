/**
 * Catalogue structure shared by the storefront, the admin and the API.
 * The shop has two segments: Upper Wear and Bottom Wear. Products store the `slug`.
 */
export interface Category {
  slug: string;
  label: string;
  /** Short line used on category cards. */
  blurb: string;
  /** Sizes pre-selected when the admin adds a product in this segment. */
  defaultSizes: string[];
}

export const CATEGORIES: Category[] = [
  { slug: 'upper', label: 'Upper Wear', blurb: 'T-shirts, shirts, hoodies & sweatshirts', defaultSizes: ['S', 'M', 'L', 'XL'] },
  { slug: 'bottom', label: 'Bottom Wear', blurb: 'Jeans, trousers & track pants', defaultSizes: ['28', '30', '32', '34', '36'] },
];

/**
 * Older category slugs (and old links such as /shop/jeans) mapped to their segment.
 * Existing products are moved to the new slugs automatically (server/db.ts).
 */
export const LEGACY_CATEGORIES: Record<string, string> = {
  't-shirts': 'upper',
  'oversized-t-shirts': 'upper',
  hoodies: 'upper',
  sweatshirts: 'upper',
  shirts: 'upper',
  topwear: 'upper',
  trousers: 'bottom',
  jeans: 'bottom',
  bottomwear: 'bottom',
};

/** Returns the segment slug for a current or legacy slug, or null if unknown. */
export function normalizeCategory(slug: string): string | null {
  if (CATEGORIES.some((c) => c.slug === slug)) return slug;
  return LEGACY_CATEGORIES[slug] ?? null;
}

/**
 * Collections are virtual groupings used in navigation. They are computed
 * from product data, so they never need manual upkeep.
 */
export interface Collection {
  slug: string;
  label: string;
  categories?: string[];
  /** Sort newest first and show only recent products. */
  newArrivals?: boolean;
}

/** Products created within this many days count as new arrivals. */
export const NEW_ARRIVAL_DAYS = 30;

export const COLLECTIONS: Collection[] = [{ slug: 'new-arrivals', label: 'New Arrivals', newArrivals: true }];

export const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '28', '30', '32', '34', '36', '38', '40', 'Free Size'];

export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const i = SIZE_OPTIONS.indexOf(s);
    return i === -1 ? 1000 : i;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Preset colours offered in the admin; the vendor can also add custom ones. */
export const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#F4F3EF' },
  { name: 'Off White', hex: '#E9E4D8' },
  { name: 'Grey Melange', hex: '#A3A3A0' },
  { name: 'Charcoal', hex: '#3A3A3A' },
  { name: 'Navy', hex: '#1E2A44' },
  { name: 'Olive', hex: '#5B5F3A' },
  { name: 'Beige', hex: '#D8C8A8' },
  { name: 'Brown', hex: '#5A3E2B' },
  { name: 'Maroon', hex: '#5C1F24' },
  { name: 'Sky Blue', hex: '#9EC1DE' },
  { name: 'Light Wash', hex: '#8FA8C4' },
  { name: 'Mid Wash', hex: '#4F6D8F' },
  { name: 'Dark Wash', hex: '#253650' },
  { name: 'Red', hex: '#B3261E' },
  { name: 'Green', hex: '#2F5D3A' },
];

export function categoryLabel(slug: string): string {
  const seg = normalizeCategory(slug);
  return CATEGORIES.find((c) => c.slug === seg)?.label ?? 'Clothing';
}

export function isCategory(slug: string): boolean {
  return CATEGORIES.some((c) => c.slug === slug);
}

export function collectionBySlug(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}
