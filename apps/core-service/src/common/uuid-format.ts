const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;

export function formatUuid(bytes: Buffer, version: number): string {
  bytes.writeUInt8(
    (bytes.readUInt8(VERSION_BYTE) & 0x0f) | (version << 4),
    VERSION_BYTE,
  );
  bytes.writeUInt8((bytes.readUInt8(VARIANT_BYTE) & 0x3f) | 0x80, VARIANT_BYTE);
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
