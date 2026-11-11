/** One Server-Sent Event; data is a single line, so JSON goes as it is. */
export const sseEvent = (event: string, data: string) => `event: ${event}\ndata: ${data}\n\n`;

/** How long a browser waits before reconnecting after the stream breaks. */
export const sseRetry = (ms: number) => `retry: ${ms}\n\n`;
