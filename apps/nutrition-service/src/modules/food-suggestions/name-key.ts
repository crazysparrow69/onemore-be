export function toNameKey(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
