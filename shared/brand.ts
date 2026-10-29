/**
 * Temporary brand identity — the single place to rebrand the store.
 * Store name, tagline, announcements, homepage copy and About page text can
 * also be changed from Admin → Settings without a redeploy; these are only defaults.
 * Copy here is deliberately neutral: it makes no claims about the business.
 */
export const BRAND = {
  name: 'UNRULED',
  /** Short descriptor used in the default page title. */
  descriptor: 'Streetwear & Menswear',
  tagline: 'Streetwear and everyday menswear.',
  /** Small label above the homepage headline. */
  heroEyebrow: 'Menswear · Streetwear · India',
  announcements: ['New collection available', 'Latest arrivals in store', 'Order directly on WhatsApp'],
  heroHeadline: 'Built for the street.',
  heroSubline: 'Oversized tees, hoodies, shirts, trousers and denim. Browse the collection and order directly on WhatsApp.',
  brandStatement: 'Clothing for every day. Pick a piece, choose your size, and message us on WhatsApp — we’ll take it from there.',
  aboutHeadline: 'About us',
  aboutText:
    'We are a small local shop selling everyday clothing.\n\n' +
    'Browse the collection, pick your colour and size, and message us on WhatsApp. We reply quickly and confirm your order on chat.',
} as const;
