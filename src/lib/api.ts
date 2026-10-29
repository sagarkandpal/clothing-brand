export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'same-origin',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Could not connect. Check your internet connection and try again.');
  }
  let data: any = null;
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    const fallback =
      res.status >= 500 ? 'The store is temporarily unavailable. Please try again shortly.' : 'Request failed.';
    throw new ApiError(res.status, data?.error ?? fallback, data?.fields);
  }
  return data as T;
}

export function imageUrl(id: string, size: 'sm' | 'lg' = 'lg'): string {
  return `/api/images/${id}/${size}`;
}
