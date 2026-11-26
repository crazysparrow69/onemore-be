import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { CloudinaryStorage } from './storage/cloudinary.storage';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaRepository,
    {
      provide: MEDIA_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MediaStorage =>
        new CloudinaryStorage({
          cloudName: config.get('CLOUDINARY_CLOUD_NAME', { infer: true }),
          apiKey: config.get('CLOUDINARY_API_KEY', { infer: true }),
          apiSecret: config.get('CLOUDINARY_API_SECRET', { infer: true }),
        }),
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
