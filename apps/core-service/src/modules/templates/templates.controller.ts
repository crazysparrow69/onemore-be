import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
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
import { TemplateIdParamsDto, TemplateInputDto } from './template-input.schema';
import {
  TemplateDto,
  TemplateListResponseDto,
  type Template,
  type TemplateListResponse,
} from './template.response';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Put(':id')
  @ApiUpsertResponse(TemplateDto, {
    replaced: 'The program was replaced with the same id',
    created: 'The program was created',
  })
  @ApiErrorResponses(400, 401, 404, 409)
  async save(
    @CurrentUser() user: AuthUser,
    @Param() params: TemplateIdParamsDto,
    @Body() body: TemplateInputDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Template> {
    const { created, template } = await this.templates.save(
      user,
      params.id,
      body,
    );
    setUpsertStatus(response, created);
    return template;
  }

  @Get()
  @ZodResponse({
    status: 200,
    description: 'All active programs of the caller with their content',
    type: TemplateListResponseDto,
  })
  @ApiErrorResponses(401)
  list(@CurrentUser() user: AuthUser): Promise<TemplateListResponse> {
    return this.templates.list(user);
  }

  @Get(':id')
  @ZodResponse({
    status: 200,
    description: 'One program with exercises and target sets',
    type: TemplateDto,
  })
  @ApiErrorResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthUser,
    @Param() params: TemplateIdParamsDto,
  ): Promise<Template> {
    return this.templates.get(user, params.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The program is archived' })
  @ApiErrorResponses(400, 401, 404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param() params: TemplateIdParamsDto,
  ): Promise<void> {
    return this.templates.archive(user, params.id);
  }
}
