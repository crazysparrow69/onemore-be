import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module';
import { BodyController } from './body.controller';
import { BodyRepository } from './body.repository';
import { BodyService } from './body.service';

@Module({
  imports: [TargetsModule],
  controllers: [BodyController],
  providers: [BodyService, BodyRepository],
})
export class BodyModule {}
