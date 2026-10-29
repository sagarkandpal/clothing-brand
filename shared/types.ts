export interface ProductImage {
  /** Media id, used in /api/images/:id/:size URLs. */
  id: string;
  width: number;
  height: number;
  /** Colour name this image belongs to, or null if it applies to every colour. */
  color: string | null;
  /** "photo" = original product photo, "mockup" = edited/studio mockup. Missing = photo. */
  kind?: ImageKind;
  /** Shot on a plain light background — displayed contained on a studio backdrop. */
  cutout?: boolean;
}

export type ImageKind = 'photo' | 'mockup';

export interface ProductColor {
  name: string;
  hex: string;
  /** Shop owner switched this colour to "Sold out". Missing = available. */
  soldOut?: boolean;
}

export interface Variant {
  size: string;
  /** null when the product has no colour options. */
  color: string | null;
  stock: number;
}

export interface Product {
  _id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price: number;
  originalPrice: number | null;
  images: ProductImage[];
  sizes: string[];
  colors: ProductColor[];
  variants: Variant[];
  totalStock: number;
  inStock: boolean;
  isActive: boolean;
  isFeatured: boolean;
  isDemo?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Set when the product is in the Trash (soft delete). */
  deletedAt?: string | null;
}

/** Lightweight shape returned by listing endpoints. */
export interface ProductCard {
  _id: string;
  name: string;
  slug: string;
  category: string;
  price: number;
  originalPrice: number | null;
  /** At most two: the primary image and an alternate shown on hover. */
  images: ProductImage[];
  /** First photo of each colour, so tapping a swatch on the card shows that colour. */
  colorImages?: Record<string, ProductImage>;
  colors: ProductColor[];
  sizes: string[];
  inStock: boolean;
  isFeatured: boolean;
  createdAt: string;
}

export interface ProductListResponse {
  items: ProductCard[];
  total: number;
  page: number;
  pages: number;
  facets: { sizes: string[]; colors: ProductColor[] };
}

export interface PublicSettings {
  storeName: string;
  tagline: string;
  announcements: string[];
  /** Digits only, international format, or null when not configured. */
  whatsappNumber: string | null;
  instagramHandle: string | null;
  /** Homepage hero and the dark brand-statement section. */
  heroHeadline: string;
  heroSubline: string;
  heroImageId: string | null;
  brandStatement: string;
  /** About page: heading, body text (paragraphs split by blank lines) and optional photo. */
  aboutHeadline: string;
  aboutText: string;
  aboutImageId: string | null;
}

export interface CategorySummary {
  slug: string;
  label: string;
  blurb: string;
  count: number;
  imageId: string | null;
  imageCutout?: boolean;
}

export interface ProductInput {
  name: string;
  description: string;
  category: string;
  price: number;
  originalPrice: number | null;
  images: { id: string; color: string | null; kind: ImageKind }[];
  sizes: string[];
  colors: ProductColor[];
  variants: Variant[];
  isActive: boolean;
  isFeatured: boolean;
}

export interface AdminStats {
  total: number;
  active: number;
  outOfStock: number;
  featured: number;
  demo: number;
  recent: Pick<Product, '_id' | 'name' | 'slug' | 'price' | 'createdAt' | 'images' | 'inStock' | 'isActive'>[];
  storage: { usedBytes: number; limitBytes: number; images: number };
}
