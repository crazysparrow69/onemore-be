import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { ExerciseInputDto } from './exercise-input.schema';
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
      'A page of exercises visible to the caller, named in the caller language. Sorted by search relevance, then by how many users trained the exercise, then by name',
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

  @Post()
  @ZodResponse({
    status: 201,
    description: 'The created private exercise',
    type: ExerciseDetailsDto,
  })
  @ApiErrorResponses(400, 401, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: ExerciseInputDto,
  ): Promise<ExerciseDetails> {
    return this.exercises.create(user, body);
  }

  @Put(':id')
  @ZodResponse({
    status: 200,
    description: 'The private exercise after a full replacement',
    type: ExerciseDetailsDto,
  })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: ExerciseIdParamsDto,
    @Body() body: ExerciseInputDto,
  ): Promise<ExerciseDetails> {
    return this.exercises.update(user, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The exercise is archived' })
  @ApiErrorResponses(400, 401, 403, 404)
  archive(
    @CurrentUser() user: AuthUser,
    @Param() params: ExerciseIdParamsDto,
  ): Promise<void> {
    return this.exercises.archive(user, params.id);
  }
}
