import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import type { UserRole } from '../../db/schema/users';
import type { AuthUser } from '../auth/auth.types';
import type { UserRecord } from './users.repository';

export type UserResponse = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  language: string;
  timeZone: string;
  createdAt: string;
};

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
