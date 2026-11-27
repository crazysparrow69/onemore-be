import { Module } from '@nestjs/common';
import { FoodSuggestionsController } from './food-suggestions.controller';
import { FoodSuggestionsRepository } from './food-suggestions.repository';
import { FoodSuggestionsService } from './food-suggestions.service';

@Module({
  controllers: [FoodSuggestionsController],
  providers: [FoodSuggestionsService, FoodSuggestionsRepository],
  exports: [FoodSuggestionsService],
})
export class FoodSuggestionsModule {}
