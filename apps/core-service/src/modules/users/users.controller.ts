import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { UpdateMeDto } from './update-me.schema';
import type { UserResponse } from './user.response';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.users.getMe(user);
  }

  @Put('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateMeDto,
  ): Promise<UserResponse> {
    return this.users.updateMe(user, body);
  }
}
