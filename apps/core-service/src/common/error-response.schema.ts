import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Mirrors `ErrorBody` in app.exception.ts: the one shape AllExceptionsFilter
// returns for every error.
export const errorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .meta({ id: 'ErrorResponse' });

export class ErrorResponseDto extends createZodDto(errorResponseSchema) {}
