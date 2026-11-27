import { Module } from '@nestjs/common';
import { TargetsModule } from '../targets/targets.module';
import { WeightController } from './weight.controller';
import { WeightRepository } from './weight.repository';
import { WeightService } from './weight.service';

@Module({
  imports: [TargetsModule],
  controllers: [WeightController],
  providers: [WeightService, WeightRepository],
})
export class WeightModule {}
