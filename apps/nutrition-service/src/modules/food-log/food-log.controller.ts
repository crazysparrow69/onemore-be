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
  DayParamsDto,
  DaysQueryDto,
  FoodEntryIdParamsDto,
  FoodEntryInputDto,
} from './food-entry-input.schema';
import {
  DayResponseDto,
  DaysResponseDto,
  FoodEntryResponseDto,
  type DayResponse,
  type DaysResponse,
  type FoodEntryResponse,
} from './food-entry.response';
import { FoodLogService } from './food-log.service';

@ApiTags('nutrition')
@ApiBearerAuth()
@Controller('nutrition')
export class FoodLogController {
  constructor(private readonly foodLog: FoodLogService) {}

  @Put('entries/:id')
  @ApiUpsertResponse(FoodEntryResponseDto, {
    replaced: 'The entry was replaced with the same id',
    created: 'The entry was created',
  })
  @ApiErrorResponses(400, 401, 404, 409)
  async save(
    @CurrentUser() user: AuthUser,
    @Param() params: FoodEntryIdParamsDto,
    @Body() body: FoodEntryInputDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<FoodEntryResponse> {
    const { created, entry } = await this.foodLog.save(
      user.id,
      params.id,
      body,
    );
    setUpsertStatus(response, created);
    return entry;
  }

  @Delete('entries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The entry is deleted' })
  @ApiErrorResponses(400, 401, 404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param() params: FoodEntryIdParamsDto,
  ): Promise<void> {
    return this.foodLog.remove(user.id, params.id);
  }

  @Get('days/:date')
  @ZodResponse({
    status: 200,
    description:
      'One day of the diary: entries, totals, the target of that day and what is left',
    type: DayResponseDto,
  })
  @ApiErrorResponses(400, 401)
  day(
    @CurrentUser() user: AuthUser,
    @Param() params: DayParamsDto,
  ): Promise<DayResponse> {
    return this.foodLog.day(user.id, params.date);
  }

  @Get('days')
  @ZodResponse({
    status: 200,
    description:
      'Totals and the target of every day that has entries in the range (up to 62 days), for the calendar',
    type: DaysResponseDto,
  })
  @ApiErrorResponses(400, 401)
  days(
    @CurrentUser() user: AuthUser,
    @Query() query: DaysQueryDto,
  ): Promise<DaysResponse> {
    return this.foodLog.days(user.id, query.from, query.to);
  }
}
