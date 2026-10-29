import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { HttpError } from './http.ts';

const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 8; // per 15 minutes, per IP and per email
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export interface AdminDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  /** Fingerprint of the env email + password this account was signed in with. */
  envKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * The admin login comes ONLY from environment variables (.env locally, Netlify
 * env vars in production): ADMIN_EMAIL + ADMIN_PASSWORD. The older names
 * ADMIN_INITIAL_EMAIL / ADMIN_INITIAL_PASSWORD still work. Change them and
 * restart/redeploy: the new login works at once and old sessions end.
 */
export function envAdmin(): { email: string; password: string } {
  const email = (process.env.ADMIN_EMAIL || process.env.ADMIN_INITIAL_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || '';
  if (!email.includes('@') || !password) {
    console.error('[auth] ADMIN_EMAIL / ADMIN_PASSWORD are not set.');
    throw new HttpError(503, 'Admin login is not set up yet. Set ADMIN_EMAIL and ADMIN_PASSWORD on the server.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[auth] ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    throw new HttpError(503, 'Admin login is not set up correctly on the server.');
  }
  return { email, password };
}

/** Changes whenever the env email or password changes, which ends old sessions. */
function envKey(env: { email: string; password: string }): string {
  return createHmac('sha256', sessionSecret()).update(`admin-env\n${env.email}\n${env.password}`).digest('hex');
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) {
    console.error('[auth] SESSION_SECRET is missing or shorter than 32 characters.');
    throw new HttpError(503, 'Admin access is not configured on the server yet.');
  }
  return secret;
}

function hashToken(token: string): string {
  return createHmac('sha256', sessionSecret()).update(token).digest('hex');
}

function safeEqualStrings(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ---------------------------------------------------------------- cookies

function isHttps(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto');
  return proto ? proto.split(',')[0].trim() === 'https' : new URL(req.url).protocol === 'https:';
}

/** `__Host-` cookies must be Secure, so plain-HTTP local dev uses a plain name. */
function cookieName(req: Request): string {
  return isHttps(req) ? '__Host-admin_session' : 'admin_session';
}

export function sessionCookie(req: Request, token: string, maxAgeSeconds: number): string {
  const parts = [`${cookieName(req)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// --------------------------------------------------------------- sessions

export async function createSession(db: Db, adminId: ObjectId): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('base64url');
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  await db.collection('sessions').insertOne({
    tokenHash: hashToken(token),
    adminId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + maxAge * 1000),
  });
  return { token, maxAge };
}

export async function destroySession(db: Db, req: Request): Promise<void> {
  const token = readCookie(req, cookieName(req));
  if (token) await db.collection('sessions').deleteOne({ tokenHash: hashToken(token) });
}

/** Server-side authorization for every admin route. */
export async function requireAdmin(db: Db, req: Request): Promise<AdminDoc> {
  const token = readCookie(req, cookieName(req));
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(401, 'Please sign in to continue.');
  const session = await db.collection('sessions').findOne({ tokenHash: hashToken(token) });
  if (!session || session.expiresAt < new Date()) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  const admin = await db.collection<AdminDoc>('admins').findOne({ _id: session.adminId });
  // A session only stays valid while the env login it was created with is unchanged.
  if (!admin || admin.envKey !== envKey(envAdmin())) throw new HttpError(401, 'Please sign in to continue.');
  return admin;
}

// ------------------------------------------------------------------ login

async function assertNotRateLimited(db: Db, keys: string[]): Promise<void> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  for (const key of keys) {
    const count = await db.collection('login_attempts').countDocuments({ key, createdAt: { $gte: since } });
    if (count >= MAX_ATTEMPTS) {
      throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    }
  }
}

async function recordFailure(db: Db, keys: string[]): Promise<void> {
  const now = new Date();
  await db.collection('login_attempts').insertMany(keys.map((key) => ({ key, createdAt: now })));
}

/**
 * Verifies credentials against ADMIN_EMAIL / ADMIN_PASSWORD. The matching
 * admin document exists only so sessions have an id to point at; any account
 * with a different email (e.g. after the env email changed) is removed.
 */
export async function login(db: Db, emailRaw: string, password: string, ip: string): Promise<AdminDoc> {
  sessionSecret(); // fail early with a clear message if auth isn't configured
  const env = envAdmin();
  const email = emailRaw.trim().toLowerCase();
  const keys = [`ip:${ip}`, `email:${email}`];
  await assertNotRateLimited(db, keys);

  // Both checks always run, so timing doesn't reveal which part was wrong.
  const emailOk = safeEqualStrings(email, env.email);
  const passwordOk = safeEqualStrings(password, env.password);
  if (!emailOk || !passwordOk) {
    await recordFailure(db, keys);
    throw new HttpError(401, 'Incorrect email or password.');
  }

  const admins = db.collection<AdminDoc>('admins');
  const now = new Date();
  const key = envKey(env);
  let admin = await admins.findOne({ email });
  if (!admin || admin.envKey !== key) {
    admin = await admins.findOneAndUpdate(
      { email },
      {
        $set: { passwordHash: await hashPassword(password), envKey: key, updatedAt: now },
        $setOnInsert: { _id: new ObjectId(), email, createdAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (!admin) throw new HttpError(500, 'Could not sign in. Please try again.');
    // Old accounts and their sessions go away when the env login changes.
    const stale = await admins.find({ _id: { $ne: admin._id } }, { projection: { _id: 1 } }).toArray();
    if (stale.length) {
      await admins.deleteMany({ _id: { $in: stale.map((a) => a._id) } });
      await db.collection('sessions').deleteMany({ adminId: { $in: stale.map((a) => a._id) } });
    }
  }
  await db.collection('login_attempts').deleteMany({ key: `email:${email}` });
  return admin;
}
