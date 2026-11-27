import { Module } from '@nestjs/common';
import { TargetsController } from './targets.controller';
import { TargetsRepository } from './targets.repository';
import { TargetsService } from './targets.service';

@Module({
  controllers: [TargetsController],
  providers: [TargetsService, TargetsRepository],
  exports: [TargetsService],
})
export class TargetsModule {}
