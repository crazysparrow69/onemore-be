import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import {
  ListWorkoutsQueryDto,
  WorkoutIdParamsDto,
  WorkoutInputDto,
} from './workout-input.schema';
import {
  WorkoutDetailsDto,
  WorkoutListResponseDto,
  type WorkoutDetails,
  type WorkoutListResponse,
} from './workout.response';
import { WorkoutsService } from './workouts.service';

@ApiTags('workouts')
@ApiBearerAuth()
@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Put(':id')
  @ZodResponse({
    status: 200,
    description: 'The workout was replaced with the same id',
    type: WorkoutDetailsDto,
  })
  @ApiResponse({
    status: 201,
    description: 'The workout was created',
    type: WorkoutDetailsDto,
  })
  @ApiErrorResponses(400, 401, 404, 409)
  async save(
    @CurrentUser() user: AuthUser,
    @Param() params: WorkoutIdParamsDto,
    @Body() body: WorkoutInputDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WorkoutDetails> {
    const { created, workout } = await this.workouts.save(
      user,
      params.id,
      body,
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return workout;
  }

  @Get()
  @ZodResponse({
    status: 200,
    description: 'A page of the caller workouts, newest first',
    type: WorkoutListResponseDto,
  })
  @ApiErrorResponses(400, 401)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListWorkoutsQueryDto,
  ): Promise<WorkoutListResponse> {
    return this.workouts.list(user, query.offset, query.limit);
  }

  @Get(':id')
  @ZodResponse({
    status: 200,
    description: 'One workout with exercises and sets',
    type: WorkoutDetailsDto,
  })
  @ApiErrorResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthUser,
    @Param() params: WorkoutIdParamsDto,
  ): Promise<WorkoutDetails> {
    return this.workouts.get(user, params.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The workout is deleted' })
  @ApiErrorResponses(400, 401, 404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param() params: WorkoutIdParamsDto,
  ): Promise<void> {
    return this.workouts.remove(user, params.id);
  }
}
