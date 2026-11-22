import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { PatchCurrentUserDto } from './patch-current-user.schema';
import { UpdateCurrentUserDto } from './update-current-user.schema';
import { UserResponseDto, type UserResponse } from './user.response';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ZodResponse({
    status: 200,
    description: 'The signed-in user',
    type: UserResponseDto,
  })
  @ApiErrorResponses(401, 404)
  getCurrentUser(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.users.getCurrentUser(user);
  }

  @Put('me')
  @ZodResponse({
    status: 200,
    description: 'The signed-in user after the update (created if new)',
    type: UserResponseDto,
  })
  @ApiErrorResponses(400, 401, 409)
  updateCurrentUser(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateCurrentUserDto,
  ): Promise<UserResponse> {
    return this.users.updateCurrentUser(user, body);
  }

  @Patch('me')
  @ZodResponse({
    status: 200,
    description: 'The signed-in user after a partial update',
    type: UserResponseDto,
  })
  @ApiErrorResponses(400, 401, 404, 409)
  patchCurrentUser(
    @CurrentUser() user: AuthUser,
    @Body() body: PatchCurrentUserDto,
  ): Promise<UserResponse> {
    return this.users.patchCurrentUser(user, body);
  }
}
