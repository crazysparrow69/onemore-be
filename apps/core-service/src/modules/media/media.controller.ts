import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../../common/api-error-responses.decorator';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import {
  CompleteUploadDto,
  CreateUploadDto,
  MediaIdParamsDto,
} from './media-input.schema';
import {
  MediaAssetDto,
  MediaUploadDto,
  type MediaAsset,
  type MediaUpload,
} from './media.response';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media/uploads')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @ZodResponse({
    status: 201,
    description:
      'A signed ticket: POST the fields and the file to upload.url, then call complete',
    type: MediaUploadDto,
  })
  @ApiErrorResponses(400, 401, 409, 429)
  createUpload(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateUploadDto,
  ): Promise<MediaUpload> {
    return this.media.createUpload(user, body.purpose);
  }

  @Post(':id/complete')
  @ZodResponse({
    status: 200,
    description: 'The upload is verified and can be attached',
    type: MediaAssetDto,
  })
  @ApiErrorResponses(400, 401, 404)
  complete(
    @CurrentUser() user: AuthUser,
    @Param() params: MediaIdParamsDto,
    @Body() body: CompleteUploadDto,
  ): Promise<MediaAsset> {
    return this.media.complete(user, params.id, body);
  }
}
