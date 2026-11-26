import { describe, expect, it } from 'vitest';
import { storageKeyOf } from './media-key';

describe('storageKeyOf', () => {
  it('puts the folder, user, purpose and id into the key', () => {
    expect(
      storageKeyOf({
        folder: 'onemore-dev',
        userId: 'user-1',
        purpose: 'avatar',
        id: 'abc',
      }),
    ).toBe('onemore-dev/u/user-1/avatar/abc');
  });

  it('replaces characters that are not safe in a public id', () => {
    expect(
      storageKeyOf({
        folder: 'f',
        userId: 'a/b?c&d+e',
        purpose: 'exercise_photo',
        id: 'x',
      }),
    ).toBe('f/u/a_b_c_d_e/exercise_photo/x');
  });
});
