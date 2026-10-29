import type { Db } from 'mongodb';
import { BRAND } from '../shared/brand.ts';
import type { PublicSettings } from '../shared/types.ts';
import { normalizeWhatsAppNumber } from '../shared/whatsapp.ts';
import { HttpError } from './http.ts';
import { deleteMediaIfUnreferenced, resolveMedia } from './media.ts';
import { cleanText } from './validate.ts';

interface SettingsDoc extends Partial<PublicSettings> {
  _id: 'store';
  updatedAt?: Date;
}

const settingsCol = (db: Db) => db.collection<SettingsDoc>('settings');

export async function getSettings(db: Db): Promise<PublicSettings> {
  const doc = (await settingsCol(db).findOne({ _id: 'store' })) ?? ({} as Partial<SettingsDoc>);
  return {
    storeName: doc.storeName || BRAND.name,
    tagline: doc.tagline ?? BRAND.tagline,
    announcements: doc.announcements ?? [...BRAND.announcements],
    // Optional server-side fallback, so a number can also be set via env var.
    whatsappNumber: normalizeWhatsAppNumber(doc.whatsappNumber || null) ?? normalizeWhatsAppNumber(process.env.WHATSAPP_NUMBER || null),
    instagramHandle: doc.instagramHandle || null,
    heroHeadline: doc.heroHeadline || BRAND.heroHeadline,
    heroSubline: doc.heroSubline ?? BRAND.heroSubline,
    heroImageId: doc.heroImageId ?? null,
    brandStatement: doc.brandStatement ?? BRAND.brandStatement,
    aboutHeadline: doc.aboutHeadline || BRAND.aboutHeadline,
    aboutText: doc.aboutText || BRAND.aboutText,
    aboutImageId: doc.aboutImageId ?? null,
  };
}

export async function updateSettings(db: Db, body: Record<string, unknown>): Promise<PublicSettings> {
  const $set: Partial<SettingsDoc> = { updatedAt: new Date() };

  if ('storeName' in body) $set.storeName = cleanText(body.storeName, 'Store name', { min: 2, max: 40 });
  if ('tagline' in body) $set.tagline = cleanText(body.tagline, 'Tagline', { max: 120 });
  if ('heroHeadline' in body) $set.heroHeadline = cleanText(body.heroHeadline, 'Hero headline', { min: 2, max: 80 });
  if ('heroSubline' in body) $set.heroSubline = cleanText(body.heroSubline, 'Hero text', { max: 220 });
  if ('brandStatement' in body) $set.brandStatement = cleanText(body.brandStatement, 'Brand statement', { max: 300 });
  if ('aboutHeadline' in body) $set.aboutHeadline = cleanText(body.aboutHeadline, 'About heading', { min: 2, max: 80 });
  if ('aboutText' in body) $set.aboutText = cleanText(body.aboutText, 'About text', { max: 3000, multiline: true });

  if ('announcements' in body) {
    if (!Array.isArray(body.announcements) || body.announcements.length > 5) {
      throw new HttpError(400, 'Up to 5 announcement messages are allowed.');
    }
    $set.announcements = body.announcements
      .map((a) => cleanText(a, 'Announcement', { max: 80 }))
      .filter(Boolean);
  }

  if ('whatsappNumber' in body) {
    const raw = cleanText(body.whatsappNumber, 'WhatsApp number', { max: 24 });
    if (raw) {
      const n = normalizeWhatsAppNumber(raw);
      if (!n) {
        throw new HttpError(400, 'Enter a valid WhatsApp number, e.g. 98765 43210 or +91 98765 43210.', {
          whatsappNumber: 'Invalid number',
        });
      }
      $set.whatsappNumber = n;
    } else $set.whatsappNumber = null;
  }

  if ('instagramHandle' in body) {
    const raw = cleanText(body.instagramHandle, 'Instagram handle', { max: 60 })
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/^@/, '')
      .replace(/\/.*$/, '');
    if (raw && !/^[A-Za-z0-9._]{1,30}$/.test(raw)) {
      throw new HttpError(400, 'Enter a valid Instagram username.', { instagramHandle: 'Invalid handle' });
    }
    $set.instagramHandle = raw || null;
  }

  // Hero photo and About photo: validate the new id, and free the old photo afterwards.
  const previous = (await settingsCol(db).findOne({ _id: 'store' })) ?? null;
  const replaced: string[] = [];
  for (const [field, label] of [
    ['heroImageId', 'Hero photo'],
    ['aboutImageId', 'About photo'],
  ] as const) {
    if (!(field in body)) continue;
    const id = body[field];
    if (id === null || id === '') $set[field] = null;
    else if (typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id) && (await resolveMedia(db, [id])).has(id)) {
      $set[field] = id;
    } else throw new HttpError(400, `${label} is no longer available. Please upload it again.`);
    const old = previous?.[field];
    if (old && old !== $set[field]) replaced.push(old);
  }

  await settingsCol(db).updateOne({ _id: 'store' }, { $set }, { upsert: true });
  if (replaced.length) await deleteMediaIfUnreferenced(db, replaced);
  return getSettings(db);
}
