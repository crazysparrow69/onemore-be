import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { AppException } from '../../common/app.exception';
import { toUserResponse, type UserResponse } from './user.response';
import type { PatchCurrentUser } from './patch-current-user.schema';
import type { UpdateCurrentUser } from './update-current-user.schema';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getCurrentUser(auth: AuthUser): Promise<UserResponse> {
    const row = await this.users.findById(auth.id);
    if (!row) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'User not found',
      );
    }
    return toUserResponse(row, auth);
  }

  async updateCurrentUser(
    auth: AuthUser,
    input: UpdateCurrentUser,
  ): Promise<UserResponse> {
    const row = await this.users.upsert({
      id: auth.id,
      email: auth.email,
      name: auth.name,
      language: input.language,
      timeZone: input.timeZone,
      units: input.units,
    });
    return toUserResponse(row, auth);
  }

  async patchCurrentUser(
    auth: AuthUser,
    input: PatchCurrentUser,
  ): Promise<UserResponse> {
    const row = await this.users.update(auth.id, definedFields(input));
    if (!row) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'User not found',
      );
    }
    return toUserResponse(row, auth);
  }
}

function definedFields(input: PatchCurrentUser): PatchCurrentUser {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
