export function unwrapCloudinaryError(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof error.error === 'object' &&
    error.error !== null
  ) {
    return error.error;
  }
  return error;
}

export function describeError(error: unknown, fallback: string): string {
  const cause = unwrapCloudinaryError(error);
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const { message } = cause;
    const httpCode =
      'http_code' in cause && typeof cause.http_code === 'number'
        ? ` (HTTP ${cause.http_code})`
        : '';
    if (typeof message === 'string' && message.length > 0) {
      return `${message}${httpCode}`;
    }
  }
  return fallback;
}
