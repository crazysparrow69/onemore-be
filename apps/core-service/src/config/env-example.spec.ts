import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ENV_KEYS } from './env';

describe('.env.example', () => {
  it('lists exactly the keys of the env schema', () => {
    const contents = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    const keys = contents
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => line.split('=', 1)[0]);

    expect(keys.sort()).toEqual([...ENV_KEYS].sort());
  });
});
