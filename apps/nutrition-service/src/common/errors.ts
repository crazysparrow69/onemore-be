import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

const CATALOG = {
  UNAUTHORIZED: [HttpStatus.UNAUTHORIZED, 'Unauthorized'],
  FORBIDDEN: [HttpStatus.FORBIDDEN, 'Forbidden'],
  CONFLICT: [HttpStatus.CONFLICT, 'Conflict'],
  INTERNAL_ERROR: [HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'],
  DATE_OUT_OF_RANGE: [
    HttpStatus.BAD_REQUEST,
    'The date is outside the allowed range',
  ],
  BODY_PROFILE_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Body profile not found'],
  GOAL_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Goal not found'],
  WEIGHT_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Weight entry not found'],
  TARGET_NOT_FOUND: [HttpStatus.NOT_FOUND, 'No daily target yet'],
  TARGET_INPUTS_MISSING: [
    HttpStatus.CONFLICT,
    'Fill in the body profile, the goal and the weight first',
  ],
  FOOD_ENTRY_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Food entry not found'],
  FOOD_ENTRY_LIMIT_REACHED: [
    HttpStatus.CONFLICT,
    'Too many food entries for one day',
  ],
  SUGGESTION_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Suggestion not found'],
} as const satisfies Record<string, readonly [HttpStatus, string]>;

export type ErrorCode = keyof typeof CATALOG;

export type ErrorOptions = { message?: string; details?: unknown };

export function appError(
  code: ErrorCode,
  options: ErrorOptions = {},
): AppException {
  const [status, message] = CATALOG[code];
  return new AppException(
    status,
    code,
    options.message ?? message,
    options.details,
  );
}
