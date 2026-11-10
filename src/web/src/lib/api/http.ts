import 'server-only';

/** api-gateway, as the Next.js server reaches it (in compose: http://api-gateway:8080). */
const API_URL = process.env.API_URL ?? 'http://localhost:8080';

/** A gateway answer other than 2xx. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined>;

/**
 * GETs /api/v1/<path> and parses the JSON. `revalidate` caches the answer for
 * that many seconds (menus change rarely); without it every request asks again.
 */
export async function get<T>(path: string, query: Query = {}, revalidate?: number): Promise<T> {
  const url = new URL(`/api/v1/${path}`, API_URL);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, revalidate === undefined ? { cache: 'no-store' } : { next: { revalidate } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join('; ') : (body?.message ?? res.statusText);
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** The value, or null when the gateway says 404. */
export async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
