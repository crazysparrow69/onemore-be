import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { GoalInputDto } from './goal-input.schema';
import { GoalResponseDto, type GoalResponse } from './goal.response';
import { GoalsService } from './goals.service';

@ApiTags('goals')
@ApiBearerAuth()
@Controller('goals/current')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description: 'The current goal of the caller',
    type: GoalResponseDto,
  })
  @ApiErrorResponses(401, 404)
  get(@CurrentUser() user: AuthUser): Promise<GoalResponse> {
    return this.goals.current(user.id);
  }

  @Put()
  @ZodResponse({
    status: 200,
    description:
      'The goal after the change. A new goal starts today and the previous one stays in the history. The daily target is recalculated in the same transaction',
    type: GoalResponseDto,
  })
  @ApiErrorResponses(400, 401)
  save(
    @CurrentUser() user: AuthUser,
    @Body() body: GoalInputDto,
  ): Promise<GoalResponse> {
    return this.goals.save(user.id, body);
  }
}
