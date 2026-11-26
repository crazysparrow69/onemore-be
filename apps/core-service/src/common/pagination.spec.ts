import { describe, expect, it } from 'vitest';
import { toPage } from './pagination';

describe('toPage', () => {
  it('points to the next offset while more items remain', () => {
    expect(toPage(['a', 'b'], 5, 0)).toEqual({
      items: ['a', 'b'],
      total: 5,
      nextOffset: 2,
    });
  });

  it('has no next offset on the last page', () => {
    expect(toPage(['e'], 5, 4).nextOffset).toBeNull();
    expect(toPage([], 0, 0).nextOffset).toBeNull();
  });
});
