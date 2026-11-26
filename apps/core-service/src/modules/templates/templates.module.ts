import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module';
import { UsersModule } from '../users/users.module';
import { TemplatesController } from './templates.controller';
import { TemplatesRepository } from './templates.repository';
import { TemplatesService } from './templates.service';

@Module({
  imports: [UsersModule, ExercisesModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplatesRepository],
})
export class TemplatesModule {}
