import type { Db } from 'mongodb';
import LIMITS from '../limits.config.json';
import { imageLimitBytes, storageUsage } from './media.ts';

/**
 * Plan usage for the admin dashboard. Numbers come from the database itself;
 * limits come from limits.config.json. Anything that is an estimate is marked
 * `approx` so the admin never sees a fake exact number.
 */

export interface Meter {
  label: string;
  usedBytes: number;
  limitBytes: number;
  percent: number;
  approx: boolean;
}

export interface Usage {
  plan: string;
  meters: Meter[];
  products: number;
  /** Rough number of extra products that fit, based on the average size so far. */
  productsLeftApprox: number | null;
  /** Highest meter percentage, used for the colour and the warnings. */
  worstPercent: number;
  warnPercent: number;
  dangerPercent: number;
  upgradePath: string[];
  netlifyUsageUrl: string;
  developerWhatsapp: string | null;
}

const MB = 1024 * 1024;

function meter(label: string, usedBytes: number, limitBytes: number, approx: boolean): Meter {
  const percent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10) : 0;
  return { label, usedBytes, limitBytes, percent, approx };
}

export async function planUsage(db: Db): Promise<Usage> {
  const [images, products] = await Promise.all([storageUsage(db), db.collection('products').countDocuments({})]);

  let dbBytes: number | null = null;
  try {
    const stats = await db.command({ dbStats: 1 });
    dbBytes = Number(stats.dataSize) + Number(stats.indexSize);
  } catch {
    // dbStats can be unavailable on some plans; the meter is then left out.
  }

  const dbLimit = LIMITS.dbLimitMB * MB;
  const meters: Meter[] = [];
  // dataSize is uncompressed, Atlas counts compressed storage: close but not exact.
  if (dbBytes !== null) meters.push(meter('Database (photos + products)', dbBytes, dbLimit, true));
  meters.push(meter('Photos', images.usedBytes, imageLimitBytes(), false));

  let productsLeftApprox: number | null = null;
  if (products > 0 && dbBytes !== null) {
    const perProduct = dbBytes / products;
    productsLeftApprox = Math.max(0, Math.floor((dbLimit - dbBytes) / perProduct));
  }

  const digits = (process.env.DEVELOPER_WHATSAPP ?? '').replace(/\D/g, '');
  return {
    plan: LIMITS.plan,
    meters,
    products,
    productsLeftApprox,
    worstPercent: Math.max(0, ...meters.map((m) => m.percent)),
    warnPercent: LIMITS.warnPercent,
    dangerPercent: LIMITS.dangerPercent,
    upgradePath: LIMITS.upgradePath,
    netlifyUsageUrl: LIMITS.netlifyUsageUrl,
    developerWhatsapp: digits.length >= 10 ? digits : null,
  };
}
