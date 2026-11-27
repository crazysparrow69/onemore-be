import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { FoodSuggestionsService } from './food-suggestions.service';
import {
  SearchSuggestionsQueryDto,
  SuggestionIdParamsDto,
} from './suggestion-input.schema';
import {
  SuggestionListResponseDto,
  type SuggestionListResponse,
} from './suggestion.response';

@ApiTags('nutrition')
@ApiBearerAuth()
@Controller('nutrition/suggestions')
export class FoodSuggestionsController {
  constructor(private readonly suggestions: FoodSuggestionsService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description:
      'Foods the caller has logged before whose name contains the query, names that start with it first',
    type: SuggestionListResponseDto,
  })
  @ApiErrorResponses(400, 401)
  search(
    @CurrentUser() user: AuthUser,
    @Query() query: SearchSuggestionsQueryDto,
  ): Promise<SuggestionListResponse> {
    return this.suggestions.search(user.id, query.q, query.limit);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({
    status: 204,
    description:
      'The suggestion is removed. Entries in the diary stay as they are',
  })
  @ApiErrorResponses(400, 401, 404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param() params: SuggestionIdParamsDto,
  ): Promise<void> {
    return this.suggestions.remove(user.id, params.id);
  }
}
