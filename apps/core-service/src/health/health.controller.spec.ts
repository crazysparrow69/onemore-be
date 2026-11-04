import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ENV } from '../config/env';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok and the configured version', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: { APP_VERSION: 'test-sha' } }],
    }).compile();

    const controller = moduleRef.get(HealthController);

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      version: 'test-sha',
    });
  });
});
