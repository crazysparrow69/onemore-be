type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

export type Camelized<T> = {
  [K in keyof T as CamelCase<K & string>]: T[K];
};

export function camelizeKeys<T extends Record<string, unknown>>(
  row: T,
): Camelized<T> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  ) as Camelized<T>;
}
