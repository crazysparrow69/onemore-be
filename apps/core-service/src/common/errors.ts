import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

const CATALOG = {
  UNAUTHORIZED: [HttpStatus.UNAUTHORIZED, 'Unauthorized'],
  FORBIDDEN: [HttpStatus.FORBIDDEN, 'Forbidden'],
  CONFLICT: [HttpStatus.CONFLICT, 'Conflict'],
  INTERNAL_ERROR: [HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'],
  USER_NOT_FOUND: [HttpStatus.NOT_FOUND, 'User not found'],
  PROFILE_REQUIRED: [
    HttpStatus.CONFLICT,
    'Create the profile before using this feature',
  ],
  NICKNAME_TAKEN: [HttpStatus.CONFLICT, 'Nickname is already used'],
  EMAIL_TAKEN: [HttpStatus.CONFLICT, 'Email is already used'],
  EXERCISE_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Exercise not found'],
  EXERCISE_READ_ONLY: [
    HttpStatus.FORBIDDEN,
    'Catalog exercises cannot be changed',
  ],
  EXERCISE_LIMIT_REACHED: [HttpStatus.CONFLICT, 'Too many own exercises'],
  EXERCISE_TYPE_LOCKED: [
    HttpStatus.CONFLICT,
    'The type cannot change because the exercise is used in a workout or a program',
  ],
  EXERCISE_CHANGED: [
    HttpStatus.CONFLICT,
    'An exercise changed while saving, try again',
  ],
  MEDIA_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Media not found'],
  MEDIA_SIGNATURE_INVALID: [
    HttpStatus.BAD_REQUEST,
    'The upload could not be verified',
  ],
  MEDIA_PURPOSE_MISMATCH: [
    HttpStatus.BAD_REQUEST,
    'The file was uploaded for another purpose',
  ],
  MEDIA_NOT_READY: [HttpStatus.CONFLICT, 'The upload is not finished'],
  MEDIA_IN_USE: [HttpStatus.CONFLICT, 'The file is already used'],
  MEDIA_UPLOAD_LIMIT: [
    HttpStatus.TOO_MANY_REQUESTS,
    'Too many unfinished uploads',
  ],
  SET_VALUES_INVALID: [
    HttpStatus.BAD_REQUEST,
    'Set values do not match the exercise type',
  ],
  WORKOUT_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Workout not found'],
  WORKOUT_EMPTY: [HttpStatus.BAD_REQUEST, 'Mark at least one set as completed'],
  WORKOUT_TIME_INVALID: [HttpStatus.BAD_REQUEST, 'The workout time is invalid'],
  WORKOUT_EXERCISE_NOT_FOUND: [
    HttpStatus.BAD_REQUEST,
    'The exercise does not exist or is not available',
  ],
  TEMPLATE_NOT_FOUND: [HttpStatus.NOT_FOUND, 'Program not found'],
  TEMPLATE_LIMIT_REACHED: [HttpStatus.CONFLICT, 'Too many programs'],
  TEMPLATE_EXERCISE_NOT_FOUND: [
    HttpStatus.BAD_REQUEST,
    'The exercise does not exist or is not available',
  ],
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
