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
import {
  ApiUpsertResponse,
  setUpsertStatus,
} from '../../common/upsert-response';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import {
  ListWorkoutsQueryDto,
  PreviousSetsQueryDto,
  WorkoutIdParamsDto,
  WorkoutInputDto,
} from './workout-input.schema';
import {
  PreviousSetsResponseDto,
  type PreviousSetsResponse,
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
  @ApiUpsertResponse(WorkoutDetailsDto, {
    replaced: 'The workout was replaced with the same id',
    created: 'The workout was created',
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
    setUpsertStatus(response, created);
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

  @Get('previous-sets')
  @ZodResponse({
    status: 200,
    description:
      'The sets of the latest saved workout for each requested exercise',
    type: PreviousSetsResponseDto,
  })
  @ApiErrorResponses(400, 401)
  previousSets(
    @CurrentUser() user: AuthUser,
    @Query() query: PreviousSetsQueryDto,
  ): Promise<PreviousSetsResponse> {
    return this.workouts.previousSets(user, query.exerciseIds);
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
