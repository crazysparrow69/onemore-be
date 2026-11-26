import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ExerciseDictionariesController } from './exercise-dictionaries.controller';
import { ExercisesController } from './exercises.controller';
import { ExercisesRepository } from './exercises.repository';
import { ExercisesService } from './exercises.service';

@Module({
  imports: [UsersModule],
  controllers: [ExercisesController, ExerciseDictionariesController],
  providers: [ExercisesService, ExercisesRepository],
  exports: [ExercisesService],
})
export class ExercisesModule {}
