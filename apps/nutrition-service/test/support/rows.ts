export function firstRow<T>(result: { rows: T[] }): T {
  const [row] = result.rows;
  if (row === undefined) {
    throw new Error('Expected the query to return a row');
  }
  return row;
}
