import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseHealthService } from '../db/database-health.service';
import { HealthController } from './health.controller';

async function createController(
  ping: () => Promise<void>,
): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: ConfigService, useValue: { get: () => 'test-sha' } },
      { provide: DatabaseHealthService, useValue: { ping } },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('returns ok and the configured version without touching the database', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const controller = await createController(ping);

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      version: 'test-sha',
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it('ready returns ok when the database answers', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const controller = await createController(ping);

    await expect(controller.getReady()).resolves.toEqual({
      status: 'ok',
      version: 'test-sha',
    });
    expect(ping).toHaveBeenCalledOnce();
  });

  it('ready answers 503 without leaking the database error', async () => {
    const ping = vi
      .fn()
      .mockRejectedValue(new Error('password authentication failed'));
    const controller = await createController(ping);

    const result = controller.getReady();
    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(result).rejects.not.toThrow(/password/);
  });
});
