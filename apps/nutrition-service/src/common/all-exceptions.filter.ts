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
import { z } from 'zod';
import { pgErrorOf } from '../db/pg-error';
import { type ErrorBody } from './app.exception';

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.locals.errorCode = body.code;
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
      return httpBody(exception);
    }

    this.logUnexpected(exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }

  private logUnexpected(exception: unknown): void {
    const message =
      exception instanceof Error ? exception.message : 'unknown error';
    const pg = pgErrorOf(exception);
    this.logger.error(
      pg === undefined ? message : `${message} (pg ${pg.code})`,
      exception instanceof Error ? exception.stack : undefined,
    );
  }
}

function httpBody(exception: HttpException): ErrorBody {
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

const errorBodySchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
});

function isErrorBody(value: unknown): value is ErrorBody {
  return errorBodySchema.safeParse(value).success;
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

function validationIssues(error: unknown): { path: string; message: string }[] {
  if (!(error instanceof z.ZodError)) {
    return [];
  }
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
