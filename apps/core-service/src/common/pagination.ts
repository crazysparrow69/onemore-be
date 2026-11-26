export type Page<T> = {
  items: T[];
  total: number;
  nextOffset: number | null;
};

export function toPage<T>(items: T[], total: number, offset: number): Page<T> {
  const end = offset + items.length;
  return { items, total, nextOffset: end < total ? end : null };
}
