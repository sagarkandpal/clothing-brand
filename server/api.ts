import type { Db } from 'mongodb';
import { createSession, destroySession, login, requireAdmin, sessionCookie } from './auth.ts';
import { getDb } from './db.ts';
import { CATALOG_CACHE, HttpError, assertSameOrigin, clientIp, errorResponse, json, readJson } from './http.ts';
import { serveImage, uploadMedia } from './media.ts';
import {
  adminStats,
  categorySummaries,
  createProduct,
  deleteDemoProducts,
  deleteProduct,
  getAdminProduct,
  getPublicProduct,
  listAdminProducts,
  listProducts,
  patchProductFlags,
  purgeOldTrash,
  updateProduct,
} from './products.ts';
import { exportBackup } from './backup.ts';
import { planUsage } from './usage.ts';
import { getSettings, updateSettings } from './settings.ts';
import { cleanText, parseProductInput, wholeNumber } from './validate.ts';

export interface ApiContext {
  ip?: string;
  /** Called after admin writes so cached catalogue responses refresh at once. */
  purgeCatalog?: () => Promise<void>;
}

type Handler = (args: { req: Request; db: Db; params: string[]; url: URL; ctx: ApiContext }) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  admin?: boolean;
  handler: Handler;
}

const ID = '([a-f0-9]{24})';

async function invalidate(ctx: ApiContext) {
  try {
    await ctx.purgeCatalog?.();
  } catch (err) {
    console.error('[api] cache purge failed', err);
  }
}

const routes: Route[] = [
  // ---------------------------------------------------------------- public
  {
    method: 'GET',
    pattern: /^\/products$/,
    handler: async ({ db, url }) => json(await listProducts(db, url.searchParams), 200, CATALOG_CACHE),
  },
  {
    method: 'GET',
    pattern: /^\/products\/([a-z0-9-]{1,80})$/,
    handler: async ({ db, params }) => json(await getPublicProduct(db, params[0]), 200, CATALOG_CACHE),
  },
  {
    method: 'GET',
    pattern: /^\/categories$/,
    handler: async ({ db }) => json(await categorySummaries(db), 200, CATALOG_CACHE),
  },
  {
    method: 'GET',
    pattern: /^\/settings$/,
    handler: async ({ db }) => json(await getSettings(db), 200, CATALOG_CACHE),
  },
  {
    method: 'GET',
    pattern: /^\/images\/([^/]+)\/([^/]+)$/,
    handler: async ({ db, params }) => serveImage(db, params[0], params[1]),
  },
  {
    // Uptime check (e.g. UptimeRobot): 200 only when the database answers.
    method: 'GET',
    pattern: /^\/health$/,
    handler: async ({ db }) => {
      try {
        await db.command({ ping: 1 });
        return json({ ok: true, db: 'up', time: new Date().toISOString() }, 200, { 'Cache-Control': 'no-store' });
      } catch {
        return json({ ok: false, db: 'down' }, 503, { 'Cache-Control': 'no-store' });
      }
    },
  },

  // ----------------------------------------------------------------- auth
  {
    method: 'POST',
    pattern: /^\/admin\/login$/,
    handler: async ({ req, db, ctx }) => {
      const body = await readJson(req, 4096);
      const email = cleanText(body.email, 'Email', { min: 3, max: 200 });
      if (typeof body.password !== 'string' || !body.password) throw new HttpError(400, 'Enter your password.');
      const admin = await login(db, email, body.password.slice(0, 200), clientIp(req, ctx.ip));
      const { token, maxAge } = await createSession(db, admin._id);
      return json({ email: admin.email }, 200, { 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie(req, token, maxAge) });
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/logout$/,
    handler: async ({ req, db }) => {
      await destroySession(db, req);
      return json({ ok: true }, 200, { 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie(req, '', 0) });
    },
  },
  {
    method: 'GET',
    pattern: /^\/admin\/session$/,
    admin: true,
    handler: async ({ req, db }) => json({ email: (await requireAdmin(db, req)).email }),
  },

  // ---------------------------------------------------------------- admin
  {
    method: 'GET',
    pattern: /^\/admin\/stats$/,
    admin: true,
    handler: async ({ db }) => {
      await purgeOldTrash(db); // clears products left in the old Trash once their 30 days are up
      return json(await adminStats(db));
    },
  },
  { method: 'GET', pattern: /^\/admin\/usage$/, admin: true, handler: async ({ db }) => json(await planUsage(db)) },
  {
    method: 'GET',
    pattern: /^\/admin\/backup$/,
    admin: true,
    handler: async ({ db }) => {
      const day = new Date().toISOString().slice(0, 10);
      return new Response(JSON.stringify(await exportBackup(db), null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="store-backup-${day}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/admin\/products$/,
    admin: true,
    handler: async ({ db, url }) => json(await listAdminProducts(db, url.searchParams)),
  },
  {
    method: 'POST',
    pattern: /^\/admin\/products$/,
    admin: true,
    handler: async ({ req, db, ctx }) => {
      const product = await createProduct(db, parseProductInput(await readJson(req)));
      await invalidate(ctx);
      return json(product, 201);
    },
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/admin/products/${ID}$`),
    admin: true,
    handler: async ({ db, params }) => json(await getAdminProduct(db, params[0])),
  },
  {
    method: 'PUT',
    pattern: new RegExp(`^/admin/products/${ID}$`),
    admin: true,
    handler: async ({ req, db, params, ctx }) => {
      const body = await readJson(req);
      const version = wholeNumber(body.version, 'Version', 1, Number.MAX_SAFE_INTEGER);
      const product = await updateProduct(db, params[0], parseProductInput(body), version);
      await invalidate(ctx);
      return json(product);
    },
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^/admin/products/${ID}$`),
    admin: true,
    handler: async ({ req, db, params, ctx }) => {
      const product = await patchProductFlags(db, params[0], await readJson(req, 1024));
      await invalidate(ctx);
      return json(product);
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^/admin/products/${ID}$`),
    admin: true,
    handler: async ({ db, params, ctx }) => {
      await deleteProduct(db, params[0]);
      await invalidate(ctx);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/demo\/clear$/,
    admin: true,
    handler: async ({ db, ctx }) => {
      const deleted = await deleteDemoProducts(db);
      await invalidate(ctx);
      return json({ deleted });
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/media$/,
    admin: true,
    handler: async ({ req, db }) => json(await uploadMedia(db, req), 201),
  },
  { method: 'GET', pattern: /^\/admin\/settings$/, admin: true, handler: async ({ db }) => json(await getSettings(db)) },
  {
    method: 'PUT',
    pattern: /^\/admin\/settings$/,
    admin: true,
    handler: async ({ req, db, ctx }) => {
      const settings = await updateSettings(db, await readJson(req, 16 * 1024));
      await invalidate(ctx);
      return json(settings);
    },
  },
];

/** Entry point shared by the Netlify Function and the local dev server. */
export async function handleApi(req: Request, ctx: ApiContext = {}): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  try {
    const method = req.method.toUpperCase() === 'HEAD' ? 'GET' : req.method.toUpperCase();

    let methodMismatch = false;
    for (const route of routes) {
      const match = route.pattern.exec(path);
      if (!match) continue;
      if (route.method !== method) {
        methodMismatch = true;
        continue;
      }
      if (method !== 'GET') assertSameOrigin(req);
      const db = await getDb();
      if (route.admin) await requireAdmin(db, req); // server-side authorization on every admin route
      return await route.handler({ req, db, params: match.slice(1), url, ctx });
    }
    if (methodMismatch) return json({ error: 'Method not allowed.' }, 405);
    return json({ error: 'Not found.' }, 404);
  } catch (err) {
    // A health check must report 503 when the database cannot even be reached.
    if (path === '/health') return json({ ok: false, db: 'down' }, 503, { 'Cache-Control': 'no-store' });
    return errorResponse(err);
  }
}
