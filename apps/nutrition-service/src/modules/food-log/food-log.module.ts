import { Module } from '@nestjs/common';
import { FoodSuggestionsModule } from '../food-suggestions/food-suggestions.module';
import { TargetsModule } from '../targets/targets.module';
import { FoodLogController } from './food-log.controller';
import { FoodLogRepository } from './food-log.repository';
import { FoodLogService } from './food-log.service';

@Module({
  imports: [TargetsModule, FoodSuggestionsModule],
  controllers: [FoodLogController],
  providers: [FoodLogService, FoodLogRepository],
})
export class FoodLogModule {}
