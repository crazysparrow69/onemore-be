import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { ZodResponse, type ZodDto } from 'nestjs-zod';

export function ApiUpsertResponse<TSchema extends z.ZodType>(
  dto: ZodDto<TSchema, false>,
  descriptions: { replaced: string; created: string },
): MethodDecorator {
  return applyDecorators(
    ZodResponse({ status: 200, description: descriptions.replaced, type: dto }),
    ApiResponse({ status: 201, description: descriptions.created, type: dto }),
  );
}

export function setUpsertStatus(response: Response, created: boolean): void {
  response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
}
