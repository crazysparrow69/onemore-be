import { Injectable } from '@nestjs/common';
import { appError } from '../../common/errors';
import { toLocale, type Locale } from '../../db/schema/locales';
import type { AuthUser } from '../auth/auth.types';
import { MediaService } from '../media/media.service';
import type { PatchCurrentUser } from './patch-current-user.schema';
import type { UpdateCurrentUser } from './update-current-user.schema';
import { toUserResponse, type UserResponse } from './user.response';
import { UsersRepository, type UserRecord } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly media: MediaService,
  ) {}

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
    const { avatarId, ...fields } = input;
    const current = await this.users.findById(auth.id);
    if (!current) {
      throw appError('USER_NOT_FOUND');
    }
    const avatarChanged =
      avatarId !== undefined && avatarId !== current.avatarId;
    if (avatarChanged && avatarId !== null) {
      await this.media.claim(auth.id, avatarId, 'avatar');
    }
    let row: UserRecord | null;
    try {
      row = await this.users.update(auth.id, {
        ...fields,
        ...(avatarChanged ? { avatarId } : {}),
      });
    } catch (error) {
      await this.undoClaim(auth.id, avatarChanged ? avatarId : undefined);
      throw error;
    }
    if (!row) {
      await this.undoClaim(auth.id, avatarChanged ? avatarId : undefined);
      throw appError('USER_NOT_FOUND');
    }
    if (avatarChanged && current.avatarId) {
      await this.media.release(auth.id, current.avatarId);
    }
    return toUserResponse(row, auth);
  }

  private async undoClaim(
    userId: string,
    avatarId: string | null | undefined,
  ): Promise<void> {
    if (avatarId) {
      await this.media.unclaim(userId, avatarId);
    }
  }
}
