import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LOCALES, type Locale } from '../../db/schema/locales';
import { DICTIONARIES, MUSCLE_GROUPS } from './dictionaries';

const option = z.object({ id: z.string(), label: z.string() });

export const exerciseDictionariesSchema = z
  .object({
    locale: z.enum(LOCALES),
    muscleGroups: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        muscles: z.array(option),
      }),
    ),
    equipment: z.array(option),
    types: z.array(option),
    categories: z.array(option),
    levels: z.array(option),
    forces: z.array(option),
    mechanics: z.array(option),
  })
  .meta({ id: 'ExerciseDictionaries' });

export class ExerciseDictionariesDto extends createZodDto(
  exerciseDictionariesSchema,
) {}

export type ExerciseDictionaries = z.infer<typeof exerciseDictionariesSchema>;

function options(
  labels: Readonly<Record<string, string>>,
): { id: string; label: string }[] {
  return Object.entries(labels).map(([id, label]) => ({ id, label }));
}

export function buildDictionaries(locale: Locale): ExerciseDictionaries {
  const dictionary = DICTIONARIES[locale];
  return {
    locale,
    muscleGroups: MUSCLE_GROUPS.map((group) => ({
      id: group.id,
      label: dictionary.muscleGroups[group.id],
      muscles: group.muscles.map((id) => ({
        id,
        label: dictionary.muscles[id],
      })),
    })),
    equipment: options(dictionary.equipment),
    types: options(dictionary.types),
    categories: options(dictionary.categories),
    levels: options(dictionary.levels),
    forces: options(dictionary.forces),
    mechanics: options(dictionary.mechanics),
  };
}
