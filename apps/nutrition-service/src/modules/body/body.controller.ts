import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { BodyInputDto } from './body-input.schema';
import { BodyResponseDto, type BodyResponse } from './body.response';
import { BodyService } from './body.service';

@ApiTags('body')
@ApiBearerAuth()
@Controller('body')
export class BodyController {
  constructor(private readonly body: BodyService) {}

  @Get()
  @ZodResponse({
    status: 200,
    description: 'The body parameters of the caller',
    type: BodyResponseDto,
  })
  @ApiErrorResponses(401, 404)
  get(@CurrentUser() user: AuthUser): Promise<BodyResponse> {
    return this.body.get(user.id);
  }

  @Put()
  @ZodResponse({
    status: 200,
    description:
      'The body parameters after the update (created if new). The daily target is recalculated in the same transaction',
    type: BodyResponseDto,
  })
  @ApiErrorResponses(400, 401)
  save(
    @CurrentUser() user: AuthUser,
    @Body() body: BodyInputDto,
  ): Promise<BodyResponse> {
    return this.body.save(user.id, body);
  }
}
