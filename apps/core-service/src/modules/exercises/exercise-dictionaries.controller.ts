import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import {
  ExerciseDictionariesDto,
  type ExerciseDictionaries,
} from './exercise-dictionaries.response';
import { ExercisesService } from './exercises.service';

@ApiTags('exercises')
@ApiBearerAuth()
@Controller('exercise-dictionaries')
export class ExerciseDictionariesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ZodResponse({
    status: 200,
    description:
      'Muscle groups, equipment and exercise attributes labelled in the caller language',
    type: ExerciseDictionariesDto,
  })
  @ApiErrorResponses(401)
  get(@CurrentUser() user: AuthUser): Promise<ExerciseDictionaries> {
    return this.exercises.dictionaries(user);
  }
}
