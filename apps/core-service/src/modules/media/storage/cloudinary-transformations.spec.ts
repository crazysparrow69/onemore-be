import { describe, expect, it, vi } from 'vitest';
import { syncNamedTransformations } from './cloudinary-transformations';

const options = { cloudName: 'c', apiKey: '1', apiSecret: 's' };
const credentials = { cloud_name: 'c', api_key: '1', api_secret: 's' };

function httpError(status: number): Error {
  return Object.assign(new Error('http error'), {
    error: { message: 'http error', http_code: status },
  });
}

function fakeApi(existing: readonly string[]) {
  return {
    transformation: vi.fn((name: string) =>
      existing.includes(name)
        ? Promise.resolve({})
        : Promise.reject(httpError(404)),
    ),
    create_transformation: vi.fn().mockResolvedValue({}),
    update_transformation: vi.fn().mockResolvedValue({}),
  };
}

describe('syncNamedTransformations', () => {
  it('creates the missing ones and allows every one of them for strict mode', async () => {
    const api = fakeApi(['b']);
    const summary = await syncNamedTransformations(
      options,
      { a: 'c_fill,w_10', b: 'c_fill,w_20' },
      api,
    );
    expect(summary).toEqual({ created: ['a'], allowed: ['a', 'b'] });
    expect(api.create_transformation).toHaveBeenCalledTimes(1);
    expect(api.create_transformation).toHaveBeenCalledWith(
      'a',
      'c_fill,w_10',
      credentials,
    );
    expect(api.update_transformation).toHaveBeenCalledWith(
      'b',
      { allowed_for_strict: true },
      credentials,
    );
  });

  it('is idempotent: a second run creates nothing', async () => {
    const api = fakeApi(['a']);
    const summary = await syncNamedTransformations(options, { a: 'x' }, api);
    expect(summary.created).toEqual([]);
    expect(api.create_transformation).not.toHaveBeenCalled();
  });

  it('rethrows errors other than not found', async () => {
    const api = fakeApi([]);
    api.transformation.mockRejectedValueOnce(httpError(401));
    await expect(
      syncNamedTransformations(options, { a: 'x' }, api),
    ).rejects.toMatchObject({
      error: { http_code: 401 },
    });
  });
});
