import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module';
import { GoalsController } from './goals.controller';
import { GoalsRepository } from './goals.repository';
import { GoalsService } from './goals.service';

@Module({
  imports: [TargetsModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsRepository],
})
export class GoalsModule {}
