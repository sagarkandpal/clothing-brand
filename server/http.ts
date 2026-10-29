export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

const BASE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Public catalogue responses: browsers always revalidate, while Netlify's CDN
 * keeps a shared copy for a minute. Admin writes purge the `catalog` tag.
 */
export const CATALOG_CACHE = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=60, stale-while-revalidate=300',
  'Netlify-Cache-Tag': 'catalog',
  'Netlify-Vary': 'query',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = NO_STORE): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message, ...(err.details ? { fields: err.details } : {}) }, err.status);
  }
  const name = (err as { name?: string })?.name ?? '';
  if (/MongoServerSelectionError|MongoNetworkError|MongoTopologyClosedError/.test(name)) {
    console.error('[api] database unavailable', err);
    return json({ error: 'The store is temporarily unavailable. Please try again in a moment.' }, 503);
  }
  console.error('[api] unexpected error', err);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected a JSON request.');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request body.');
  return body as Record<string, unknown>;
}

/**
 * Blocks cross-site state-changing requests. The session cookie is already
 * SameSite=Strict; this is a second, explicit check on the Origin header.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // same-origin fetches from older browsers / server tools
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Forbidden.');
  }
  if (originHost !== host) throw new HttpError(403, 'Forbidden.');
}

export function clientIp(req: Request, contextIp?: string): string {
  return (
    contextIp ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
