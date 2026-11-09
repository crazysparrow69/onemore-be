function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function bodyOf(response: { body: unknown }): Record<string, unknown> {
  if (!isRecord(response.body)) {
    throw new Error('expected an object response body');
  }
  return response.body;
}
