import { describe, expect, it } from 'vitest';
import { uuidV7 } from './uuid-v7';

describe('uuidV7', () => {
  it('has version 7 and the RFC variant', () => {
    expect(uuidV7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('starts with the millisecond timestamp', () => {
    const at = Date.UTC(2026, 10, 25, 20, 0, 0);
    const prefix = uuidV7(at).replaceAll('-', '').slice(0, 12);

    expect(parseInt(prefix, 16)).toBe(at);
  });

  it('sorts by creation time and does not repeat', () => {
    const earlier = uuidV7(1_000_000);
    const later = uuidV7(2_000_000);

    expect(earlier < later).toBe(true);
    expect(uuidV7(1)).not.toBe(uuidV7(1));
  });
});
