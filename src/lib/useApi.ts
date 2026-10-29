import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

// Short-lived in-memory cache so back/forward navigation renders instantly.
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 60_000;

export function invalidateApiCache(prefix = '') {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

export function useApi<T>(path: string | null, { cacheable = true } = {}): ApiState<T> {
  const cached = path && cacheable ? cache.get(path) : undefined;
  const [data, setData] = useState<T | null>(cached ? (cached.data as T) : null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path && !cached);
  const [tick, setTick] = useState(0);
  const current = useRef(path);
  current.current = path;

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const hit = cacheable ? cache.get(path) : undefined;
    if (hit) setData(hit.data as T);
    if (hit && Date.now() - hit.at < TTL && tick === 0) {
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    if (!hit) setLoading(true);
    setError(null);
    api<T>(path, { signal: ctrl.signal })
      .then((d) => {
        if (cacheable) cache.set(path, { at: Date.now(), data: d });
        if (current.current === path) setData(d);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (current.current === path) setError(err instanceof ApiError ? err : new ApiError(0, 'Something went wrong.'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted && current.current === path) setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, tick, cacheable]);

  const reload = useCallback(() => {
    if (path) cache.delete(path);
    setTick((t) => t + 1);
  }, [path]);

  return { data, error, loading, reload };
}
