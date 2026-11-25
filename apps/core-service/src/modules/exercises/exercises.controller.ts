import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import {
  ExerciseDetailsDto,
  ExerciseListResponseDto,
  type ExerciseDetails,
  type ExerciseListResponse,
} from './exercise.response';
import { ExercisesService } from './exercises.service';
import {
  ExerciseIdParamsDto,
  ListExercisesQueryDto,
} from './list-exercises.schema';

@ApiTags('exercises')
@ApiBearerAuth()
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description:
      'A page of exercises visible to the caller, named in the caller language',
    type: ExerciseListResponseDto,
  })
  @ApiErrorResponses(400, 401)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListExercisesQueryDto,
  ): Promise<ExerciseListResponse> {
    return this.exercises.list(user, query);
  }

  @Get(':id')
  @ZodResponse({
    status: 200,
    description: 'One exercise with its technique steps',
    type: ExerciseDetailsDto,
  })
  @ApiErrorResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthUser,
    @Param() params: ExerciseIdParamsDto,
  ): Promise<ExerciseDetails> {
    return this.exercises.get(user, params.id);
  }
}
