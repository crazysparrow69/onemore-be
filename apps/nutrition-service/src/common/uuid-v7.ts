import { randomBytes } from 'node:crypto';
import { formatUuid } from './uuid-format';

const TIMESTAMP_BYTES = 6;

export function uuidV7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, TIMESTAMP_BYTES);
  return formatUuid(bytes, 7);
}
