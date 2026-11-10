import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { type ErrorBody } from './app.exception';

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

type ValidationIssue = { path: string; message: string };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof ZodValidationException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: validationIssues(exception.getZodError()),
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw: unknown = exception.getResponse();
      if (isErrorBody(raw)) {
        return raw;
      }
      return {
        statusCode,
        code: CODE_BY_STATUS[statusCode] ?? 'HTTP_ERROR',
        message: messageOf(raw),
      };
    }

    const message =
      exception instanceof Error ? exception.message : 'unknown error';
    const pgCode = postgresCode(exception);
    this.logger.error(
      pgCode === undefined ? message : `${message} (pg ${pgCode})`,
      exception instanceof Error ? exception.stack : undefined,
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }
}

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if (
    'code' in error &&
    typeof error.code === 'string' &&
    /^[0-9A-Z]{5}$/.test(error.code)
  ) {
    return error.code;
  }
  if ('cause' in error) {
    return postgresCode(error.cause);
  }
  return undefined;
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    typeof body.statusCode === 'number' &&
    typeof body.code === 'string' &&
    typeof body.message === 'string'
  );
}

function messageOf(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(messageOf).join('; ');
  }
  if (typeof value === 'object' && value !== null && 'message' in value) {
    return messageOf(value.message);
  }
  return 'Request failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function validationIssues(error: unknown): ValidationIssue[] {
  if (!isRecord(error) || !isUnknownArray(error.issues)) {
    return [];
  }
  return error.issues.map((issue) => {
    if (!isRecord(issue)) {
      return { path: '', message: 'Invalid' };
    }
    const path = isUnknownArray(issue.path)
      ? issue.path.map((part) => String(part)).join('.')
      : '';
    const message =
      typeof issue.message === 'string' ? issue.message : 'Invalid';
    return { path, message };
  });
}
