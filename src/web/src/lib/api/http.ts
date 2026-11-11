import 'server-only';

/** api-gateway, as the Next.js server reaches it (in compose: http://api-gateway:8080). */
const API_URL = process.env.API_URL ?? 'http://localhost:8080';

/** A gateway answer other than 2xx, with the service's message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** The caller's access token, for routes that need a signed-in user. */
  token?: string | null;
  /** Extra headers, e.g. Idempotency-Key. */
  headers?: Record<string, string>;
  /** Cache a GET for this many seconds (menus change rarely); otherwise every request asks again. */
  revalidate?: number;
}

/** Calls /api/v1/<path> and parses the JSON answer (undefined for 204). */
export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`/api/v1/${path}`, API_URL);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const cacheable = method === 'GET' && opts.revalidate !== undefined && !opts.token;
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    ...(cacheable ? { next: { revalidate: opts.revalidate } } : { cache: 'no-store' }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join('; ') : (body?.message ?? res.statusText);
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const get = <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts);
export const post = <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
  request<T>('POST', path, { ...opts, body });

export const put = <T>(path: string, body: unknown, opts?: Omit<RequestOptions, 'body'>) =>
  request<T>('PUT', path, { ...opts, body });
export const del = <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('DELETE', path, opts);
export const patch = <T>(path: string, body: unknown, opts?: Omit<RequestOptions, 'body'>) =>
  request<T>('PATCH', path, { ...opts, body });

/** The service's reason for refusing a request (a 4xx), to show on the form; null for failures a form can't fix. */
export const refusal = (err: unknown): string | null =>
  err instanceof ApiError && err.status < 500 ? err.message : null;

/**
 * Opens a WebSocket to /api/v1/<path> as the user. The token goes as the subprotocol `bearer.<token>`
 * next to the real one, which is how the gateway takes it on sockets (contracts/README.md#websockets).
 */
export function socket(path: string, protocol: string, token: string): WebSocket {
  const url = new URL(`/api/v1/${path}`, API_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(url, [protocol, `bearer.${token}`]);
}

/** The value, or null when the gateway says 404. */
export async function orNull<T>(pending: Promise<T>): Promise<T | null> {
  try {
    return await pending;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
