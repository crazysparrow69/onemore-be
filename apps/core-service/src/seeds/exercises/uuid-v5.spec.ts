import { describe, expect, it } from 'vitest';
import { uuidV5 } from './uuid-v5';

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('matches the RFC 4122 example', () => {
    expect(uuidV5('www.example.com', DNS_NAMESPACE)).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('is stable for the same name and differs for another name', () => {
    expect(uuidV5('a', DNS_NAMESPACE)).toBe(uuidV5('a', DNS_NAMESPACE));
    expect(uuidV5('a', DNS_NAMESPACE)).not.toBe(uuidV5('b', DNS_NAMESPACE));
  });

  it('sets version 5 and the RFC variant', () => {
    expect(uuidV5('anything', DNS_NAMESPACE)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('rejects an invalid namespace', () => {
    expect(() => uuidV5('a', 'not-a-uuid')).toThrow(/Invalid namespace/);
  });
});
