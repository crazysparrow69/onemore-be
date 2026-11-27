import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.schema';

const DESCRIPTIONS = {
  400: 'Validation failed or the date is outside the allowed range',
  401: 'Missing or invalid access token',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict: a precondition is not met or a limit is reached (for example TARGET_INPUTS_MISSING, FOOD_ENTRY_LIMIT_REACHED)',
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
