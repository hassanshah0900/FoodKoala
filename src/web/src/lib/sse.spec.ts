import { describe, expect, it } from 'vitest';
import { sseEvent, sseRetry } from './sse';

describe('sseEvent', () => {
  it('names the event and ends with a blank line', () => {
    expect(sseEvent('tracking', '{"version":3}')).toBe('event: tracking\ndata: {"version":3}\n\n');
  });
});

describe('sseRetry', () => {
  it('sets the reconnect delay', () => {
    expect(sseRetry(5000)).toBe('retry: 5000\n\n');
  });
});
