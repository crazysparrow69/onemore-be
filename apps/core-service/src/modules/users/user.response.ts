import { HttpStatus } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AppException } from '../../common/app.exception';
import {
  UNITS,
  USER_ROLES,
  type Units,
  type UserRole,
} from '../../db/schema/users';
import type { AuthUser } from '../auth/auth.types';
import type { UserRecord } from './users.repository';

export const userResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    nickname: z.string().nullable(),
    role: z.enum(USER_ROLES),
    language: z.string(),
    units: z.enum(UNITS),
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
    name: row.name ?? auth.name,
    nickname: row.nickname,
    role: assertRole(row.role),
    language: row.language,
    units: assertUnits(row.units),
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

function assertUnits(units: string): Units {
  if (units === 'kg' || units === 'lb') {
    return units;
  }
  throw new AppException(
    HttpStatus.INTERNAL_SERVER_ERROR,
    'INTERNAL_ERROR',
    'Internal server error',
  );
}
