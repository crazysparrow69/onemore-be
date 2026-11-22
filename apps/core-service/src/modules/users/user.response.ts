import { HttpStatus } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AppException } from '../../common/app.exception';
import { USER_ROLES, type UserRole } from '../../db/schema/users';
import type { AuthUser } from '../auth/auth.types';
import type { UserRecord } from './users.repository';

export const userResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    role: z.enum(USER_ROLES),
    language: z.string(),
    timeZone: z.string(),
    createdAt: z.string().meta({ format: 'date-time' }),
  })
  .meta({ id: 'UserResponse' });

export class UserResponseDto extends createZodDto(userResponseSchema) {}

export type UserResponse = z.infer<typeof userResponseSchema>;

export function toUserResponse(row: UserRecord, auth: AuthUser): UserResponse {
  return {
    id: row.id,
    email: auth.email,
    name: auth.name,
    role: assertRole(row.role),
    language: row.language,
    timeZone: row.timeZone,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertRole(role: string): UserRole {
  if (role === 'user' || role === 'admin') {
    return role;
  }
  throw new AppException(
    HttpStatus.INTERNAL_SERVER_ERROR,
    'INTERNAL_ERROR',
    'Internal server error',
  );
}
