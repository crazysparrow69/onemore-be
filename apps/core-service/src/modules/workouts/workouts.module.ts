import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module';
import { UsersModule } from '../users/users.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsRepository } from './workouts.repository';
import { WorkoutsService } from './workouts.service';

@Module({
  imports: [UsersModule, ExercisesModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutsRepository],
})
export class WorkoutsModule {}
