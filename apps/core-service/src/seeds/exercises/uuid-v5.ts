import { createHash } from 'node:crypto';
import { formatUuid } from '../../common/uuid-format';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidV5(name: string, namespace: string): string {
  if (!UUID_PATTERN.test(namespace)) {
    throw new Error(`Invalid namespace UUID: ${namespace}`);
  }
  const digest = createHash('sha1')
    .update(Buffer.from(namespace.replaceAll('-', ''), 'hex'))
    .update(name, 'utf8')
    .digest();
  return formatUuid(digest.subarray(0, 16), 5);
}
