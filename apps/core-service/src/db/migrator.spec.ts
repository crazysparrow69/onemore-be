import { describe, expect, it } from 'vitest';
import { toDirectUrl } from './migrator';

describe('toDirectUrl', () => {
  it('removes -pooler from the Neon host and keeps the rest', () => {
    expect(
      toDirectUrl(
        'postgresql://core_svc:p%40ss@ep-shy-leaf-123-pooler.c-7.eu-central-1.aws.neon.tech:5432/neondb?sslmode=require',
      ),
    ).toBe(
      'postgresql://core_svc:p%40ss@ep-shy-leaf-123.c-7.eu-central-1.aws.neon.tech:5432/neondb?sslmode=require',
    );
  });

  it('leaves a direct or local string unchanged', () => {
    const local = 'postgresql://core_svc:secret@localhost:5432/onemore';
    expect(toDirectUrl(local)).toBe(local);
  });
});
