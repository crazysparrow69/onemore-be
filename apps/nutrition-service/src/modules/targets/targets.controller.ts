import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import {
  AutoTargetInputDto,
  ManualTargetInputDto,
  TargetQueryDto,
} from './target-input.schema';
import { TargetResponseDto, type TargetResponse } from './target.response';
import { TargetsService } from './targets.service';

@ApiTags('nutrition')
@ApiBearerAuth()
@Controller('nutrition/target')
export class TargetsController {
  constructor(private readonly targets: TargetsService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description:
      'The daily target that was in force on the date: calories and macros with the inputs they were calculated from',
    type: TargetResponseDto,
  })
  @ApiErrorResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthUser,
    @Query() query: TargetQueryDto,
  ): Promise<TargetResponse> {
    return this.targets.get(user.id, query.date);
  }

  @Put('manual')
  @ZodResponse({
    status: 200,
    description:
      'The target after setting own calories from today. Macros follow from them by the same rules as the formula; the target stays as set until "auto" is chosen again',
    type: TargetResponseDto,
  })
  @ApiErrorResponses(400, 401)
  setOwn(
    @CurrentUser() user: AuthUser,
    @Body() body: ManualTargetInputDto,
  ): Promise<TargetResponse> {
    return this.targets.setOwn(user.id, body.today, body.caloriesKcal);
  }

  @Put('auto')
  @ZodResponse({
    status: 200,
    description:
      'The target after going back to the formula from today. Needs the body profile, the goal and at least one weight',
    type: TargetResponseDto,
  })
  @ApiErrorResponses(400, 401, 409)
  useFormula(
    @CurrentUser() user: AuthUser,
    @Body() body: AutoTargetInputDto,
  ): Promise<TargetResponse> {
    return this.targets.useFormula(user.id, body.today);
  }
}
