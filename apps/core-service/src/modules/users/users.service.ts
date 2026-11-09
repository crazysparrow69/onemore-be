import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { AppException } from '../../common/app.exception';
import { toUserResponse, type UserResponse } from './user.response';
import type { UpdateMe } from './update-me.schema';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getMe(auth: AuthUser): Promise<UserResponse> {
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

  async updateMe(auth: AuthUser, input: UpdateMe): Promise<UserResponse> {
    const row = await this.users.upsert({
      id: auth.id,
      email: auth.email,
      language: input.language,
      timeZone: input.timeZone,
    });
    return toUserResponse(row, auth);
  }
}
