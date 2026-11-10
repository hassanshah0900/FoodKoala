// Reading the URL: Next.js hands pages each query parameter as a string, a list, or nothing.

export type Params = Record<string, string | string[] | undefined>;

/** The first value, trimmed; undefined when it is missing or blank. */
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids are UUIDs; anything else gets a 404 here instead of a 400 from the service. */
export const isUuid = (v: string | undefined): v is string => v !== undefined && UUID.test(v);
