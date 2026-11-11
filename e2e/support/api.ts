import { API_URL } from './env.ts';

/** Calls api-gateway's /api/v1/<path> as the token's user, failing the test on any non-2xx answer. */
export async function call<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(new URL(`/api/v1/${path}`, API_URL), {
    method,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
