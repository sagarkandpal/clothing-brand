/**
 * Normalises a phone number into WhatsApp's international format: digits only,
 * country code first, no "+" or leading zeros. Indian 10-digit mobile numbers
 * get the 91 prefix. Returns null for anything that cannot be a valid number,
 * so the storefront never links to a made-up contact.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (!/^\d+$/.test(s)) return null;
  // Local Indian formats: 0XXXXXXXXXX or a bare 10-digit mobile starting 6-9.
  if (s.length === 11 && s.startsWith('0')) s = s.slice(1);
  if (s.length === 10 && /^[6-9]/.test(s)) s = '91' + s;
  if (s.startsWith('0')) return null;
  if (s.length < 10 || s.length > 15) return null;
  if (s.startsWith('91') && !/^91[6-9]\d{9}$/.test(s)) return null;
  return s;
}

export function whatsappLink(number: string | null | undefined, message?: string): string | null {
  const n = normalizeWhatsAppNumber(number);
  if (!n) return null;
  return message ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : `https://wa.me/${n}`;
}

export function formatINR(value: number): string {
  return '₹' + Math.round(value).toLocaleString('en-IN');
}

export interface EnquiryDetails {
  name: string;
  price: number;
  size?: string | null;
  color?: string | null;
  url: string;
}

export function productEnquiryMessage(d: EnquiryDetails): string {
  const lines = ["Hi! I'm interested in this product:", '', `Product: ${d.name}`, `Price: ${formatINR(d.price)}`];
  if (d.size) lines.push(`Size: ${d.size}`);
  if (d.color) lines.push(`Color: ${d.color}`);
  lines.push('', `Product link: ${d.url}`, '', 'Is this available?');
  return lines.join('\n');
}
