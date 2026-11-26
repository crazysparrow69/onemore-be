import { Injectable } from '@nestjs/common';
import { appError } from '../../common/errors';
import { toLocale, type Locale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import type { PatchCurrentUser } from './patch-current-user.schema';
import type { UpdateCurrentUser } from './update-current-user.schema';
import { toUserResponse, type UserResponse } from './user.response';
import { UsersRepository, type UserRecord } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.users.findById(id);
  }

  async requireProfile(id: string): Promise<UserRecord> {
    const user = await this.users.findById(id);
    if (!user) {
      throw appError('PROFILE_REQUIRED');
    }
    return user;
  }

  async localeOf(id: string): Promise<Locale> {
    return toLocale((await this.users.findById(id))?.language);
  }

  async getCurrentUser(auth: AuthUser): Promise<UserResponse> {
    const row = await this.users.findById(auth.id);
    if (!row) {
      throw appError('USER_NOT_FOUND');
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
      ...input,
    });
    return toUserResponse(row, auth);
  }

  async patchCurrentUser(
    auth: AuthUser,
    input: PatchCurrentUser,
  ): Promise<UserResponse> {
    const row = await this.users.update(auth.id, input);
    if (!row) {
      throw appError('USER_NOT_FOUND');
    }
    return toUserResponse(row, auth);
  }
}
