import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Identity } from '../identity/identity';

export interface CallOptions {
  method?: 'GET' | 'DELETE';
  /** Forwarded as the gateway's identity headers (ADR 0005), so the callee authorizes the real caller. */
  as?: Identity;
  query?: Record<string, string | number>;
  timeoutMs: number;
}

export interface Reply<T> {
  status: number;
  body: T;
}

/** The headers api-gateway would have sent for this caller. */
export const identityHeaders = (me: Identity): Record<string, string> => ({
  'X-User-Id': me.userId,
  'X-User-Phone': me.phone,
  'X-User-Roles': me.roles.join(','),
});

/**
 * Calls another service. Any answer below 500 is returned for the caller to
 * judge; no answer, a timeout or a 5xx becomes 503, so checks fail closed.
 */
export async function call<T>(service: string, baseUrl: string, path: string, opts: CallOptions): Promise<Reply<T>> {
  const url = new URL(path, baseUrl.replace(/\/?$/, '/'));
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.as ? identityHeaders(opts.as) : {},
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    throw new UnavailableService(service, String(err));
  }
  if (res.status >= 500) throw new UnavailableService(service, `answered ${res.status}`);
  const text = await res.text();
  try {
    return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
  } catch {
    throw new UnavailableService(service, `answered ${res.status} with a body that is not JSON`);
  }
}

const logger = new Logger('ServiceCall');

/** 503 for the client; `detail` is for the logs only. */
export class UnavailableService extends ServiceUnavailableException {
  constructor(
    readonly service: string,
    readonly detail: string,
  ) {
    super(`Could not reach ${service}; try again`);
    logger.error(`${service}: ${detail}`);
  }
}
