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
  ListWeightQueryDto,
  RemoveWeightQueryDto,
  WeightDateParamsDto,
  WeightInputDto,
} from './weight-input.schema';
import {
  WeightListResponseDto,
  WeightResponseDto,
  type WeightListResponse,
  type WeightResponse,
} from './weight.response';
import { WeightService } from './weight.service';

@ApiTags('weight')
@ApiBearerAuth()
@Controller('weight')
export class WeightController {
  constructor(private readonly weight: WeightService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description: 'The weight journal of the caller, newest day first',
    type: WeightListResponseDto,
  })
  @ApiErrorResponses(400, 401)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListWeightQueryDto,
  ): Promise<WeightListResponse> {
    return this.weight.list(user.id, query);
  }

  @Get('latest')
  @ZodResponse({
    status: 200,
    description: 'The most recent weight entry',
    type: WeightResponseDto,
  })
  @ApiErrorResponses(401, 404)
  latest(@CurrentUser() user: AuthUser): Promise<WeightResponse> {
    return this.weight.latest(user.id);
  }

  @Put(':date')
  @ApiUpsertResponse(WeightResponseDto, {
    replaced: 'The weight of that day was replaced',
    created: 'The weight of that day was recorded',
  })
  @ApiErrorResponses(400, 401)
  async save(
    @CurrentUser() user: AuthUser,
    @Param() params: WeightDateParamsDto,
    @Body() body: WeightInputDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WeightResponse> {
    const { created, weight } = await this.weight.save(
      user.id,
      params.date,
      body,
    );
    setUpsertStatus(response, created);
    return weight;
  }

  @Delete(':date')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The weight entry is deleted' })
  @ApiErrorResponses(400, 401, 404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param() params: WeightDateParamsDto,
    @Query() query: RemoveWeightQueryDto,
  ): Promise<void> {
    return this.weight.remove(user.id, params.date, query.today);
  }
}
