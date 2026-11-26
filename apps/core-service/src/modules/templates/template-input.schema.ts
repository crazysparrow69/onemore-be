import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  cleanText,
  createIdParamsDto,
  MAX_NAME_LENGTH,
  optionalNotes,
} from '../../common/validation';
import {
  MAX_EXERCISES_PER_PLAN,
  MAX_SETS_PER_EXERCISE,
  restSeconds,
  setValueShape,
} from '../exercises/set-input';

export const MAX_TEMPLATES = 100;

const name = cleanText({ min: 1, max: MAX_NAME_LENGTH });

const setSchema = z
  .strictObject(setValueShape)
  .meta({ id: 'TemplateSetInput' });

const exerciseSchema = z
  .strictObject({
    exerciseId: z.uuid(),
    notes: optionalNotes,
    restSeconds,
    sets: z.array(setSchema).min(1).max(MAX_SETS_PER_EXERCISE),
  })
  .meta({ id: 'TemplateExerciseInput' });

export const templateInputSchema = z
  .strictObject({
    name,
    notes: optionalNotes,
    exercises: z.array(exerciseSchema).min(1).max(MAX_EXERCISES_PER_PLAN),
  })
  .meta({ id: 'TemplateInput' });

export class TemplateInputDto extends createZodDto(templateInputSchema) {}

export type TemplateInput = z.output<typeof templateInputSchema>;

export class TemplateIdParamsDto extends createIdParamsDto(
  'TemplateIdParams',
) {}
