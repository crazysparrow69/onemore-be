import { HttpException, type HttpStatus } from '@nestjs/common';

export type ErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
};

export class AppException extends HttpException {
  constructor(
    statusCode: HttpStatus,
    code: string,
    message: string,
    details?: unknown,
  ) {
    const body: ErrorBody = { statusCode, code, message };
    if (details !== undefined) {
      body.details = details;
    }
    super(body, statusCode);
  }
}
