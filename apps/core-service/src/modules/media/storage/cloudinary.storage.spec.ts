import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CloudinaryStorage } from './cloudinary.storage';

const options = {
  cloudName: 'demo-cloud',
  apiKey: '123456789012345',
  apiSecret: 'test-secret',
  now: () => 1_700_000_000_500,
};

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

describe('CloudinaryStorage.createUpload', () => {
  const storage = new CloudinaryStorage(options);
  const ticket = storage.createUpload({
    key: 'dev/u/user-1/avatar/a1',
    maxSide: 1024,
  });

  it('targets the image upload endpoint of the cloud', () => {
    expect(ticket.url).toBe(
      'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
    );
  });

  it('signs the sorted parameters with the secret and never exposes the secret', () => {
    const expected = sha1(
      'allowed_formats=jpg,png,webp&overwrite=false&public_id=dev/u/user-1/avatar/a1&timestamp=1700000000&transformation=c_limit,h_1024,w_1024' +
        'test-secret',
    );
    expect(ticket.fields).toEqual({
      allowed_formats: 'jpg,png,webp',
      overwrite: 'false',
      public_id: 'dev/u/user-1/avatar/a1',
      timestamp: '1700000000',
      transformation: 'c_limit,h_1024,w_1024',
      api_key: '123456789012345',
      signature: expected,
    });
    expect(JSON.stringify(ticket)).not.toContain('test-secret');
  });

  it('puts the size limit into the signed incoming transformation', () => {
    const other = storage.createUpload({ key: 'k', maxSide: 1600 });
    expect(other.fields.transformation).toBe('c_limit,h_1600,w_1600');
    expect(other.fields.signature).not.toBe(ticket.fields.signature);
  });
});

describe('CloudinaryStorage.verifyUpload', () => {
  const storage = new CloudinaryStorage(options);
  const signature = sha1(
    'public_id=dev/u/user-1/avatar/a1&version=1700000001test-secret',
  );

  it('accepts the signature Cloudinary returns for the key and version', () => {
    expect(
      storage.verifyUpload({
        key: 'dev/u/user-1/avatar/a1',
        version: 1_700_000_001,
        signature,
      }),
    ).toBe(true);
  });

  it('rejects a changed version, a changed key and a malformed signature', () => {
    expect(
      storage.verifyUpload({
        key: 'dev/u/user-1/avatar/a1',
        version: 1_700_000_002,
        signature,
      }),
    ).toBe(false);
    expect(
      storage.verifyUpload({
        key: 'dev/u/user-2/avatar/a1',
        version: 1_700_000_001,
        signature,
      }),
    ).toBe(false);
    expect(
      storage.verifyUpload({
        key: 'dev/u/user-1/avatar/a1',
        version: 1_700_000_001,
        signature: 'short',
      }),
    ).toBe(false);
  });
});

describe('CloudinaryStorage.remove', () => {
  it('destroys the file with its own credentials and invalidates the CDN', async () => {
    const destroy = vi.fn().mockResolvedValue({ result: 'ok' });
    await new CloudinaryStorage(options, { destroy }).remove(
      'dev/u/user-1/avatar/a1',
    );
    expect(destroy).toHaveBeenCalledWith('dev/u/user-1/avatar/a1', {
      resource_type: 'image',
      invalidate: true,
      cloud_name: 'demo-cloud',
      api_key: '123456789012345',
      api_secret: 'test-secret',
    });
  });

  it('treats a missing file as removed', async () => {
    const destroy = vi.fn().mockResolvedValue({ result: 'not found' });
    await expect(
      new CloudinaryStorage(options, { destroy }).remove('k'),
    ).resolves.toBeUndefined();
  });

  it('throws when Cloudinary reports another result', async () => {
    const destroy = vi.fn().mockResolvedValue({ result: 'error' });
    await expect(
      new CloudinaryStorage(options, { destroy }).remove('k'),
    ).rejects.toThrow(/did not delete/);
  });
});
