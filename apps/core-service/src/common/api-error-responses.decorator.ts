import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.schema';

const DESCRIPTIONS = {
  400: 'Validation failed',
  401: 'Missing or invalid access token',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict: the value is already used or a limit is reached (for example NICKNAME_TAKEN, EXERCISE_LIMIT_REACHED)',
  429: 'Too many requests: a per-user limit is reached (for example MEDIA_UPLOAD_LIMIT)',
  503: 'Dependency unavailable',
} as const satisfies Record<number, string>;

export function ApiErrorResponses(
  ...statuses: (keyof typeof DESCRIPTIONS)[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        type: ErrorResponseDto,
      }),
    ),
  );
}
