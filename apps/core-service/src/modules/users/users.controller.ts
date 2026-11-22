import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { UpdateMeDto } from './update-me.schema';
import { UserResponseDto, type UserResponse } from './user.response';
import { UsersService } from './users.service';

@ApiTags('me')
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
  getMe(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.users.getMe(user);
  }

  @Put('me')
  @ZodResponse({
    status: 200,
    description: 'The signed-in user after the update (created if new)',
    type: UserResponseDto,
  })
  @ApiErrorResponses(400, 401)
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateMeDto,
  ): Promise<UserResponse> {
    return this.users.updateMe(user, body);
  }
}
