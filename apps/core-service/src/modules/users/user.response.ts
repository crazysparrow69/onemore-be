import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UNITS, USER_ROLES } from '../../db/schema/users';
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
    avatar: z.string().nullable().meta({
      description: 'Media key of the avatar; null when the user has none',
    }),
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
    role: row.role,
    language: row.language,
    units: row.units,
    timeZone: row.timeZone,
    avatar: row.avatarKey,
    createdAt: row.createdAt.toISOString(),
  };
}
