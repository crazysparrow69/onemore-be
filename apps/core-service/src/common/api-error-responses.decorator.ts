import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.schema';

const DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'Validation failed',
  401: 'Missing or invalid access token',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict: the value is already used (for example EMAIL_TAKEN, NICKNAME_TAKEN)',
  503: 'Dependency unavailable',
};

export function ApiErrorResponses(
  ...statuses: (keyof typeof DESCRIPTIONS)[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status: Number(status),
        description: DESCRIPTIONS[status],
        type: ErrorResponseDto,
      }),
    ),
  );
}
