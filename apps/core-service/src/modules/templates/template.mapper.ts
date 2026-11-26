import { groupBy } from '../../common/collections';
import { pickSetColumns } from '../exercises/prepare-exercises';
import type { Template } from './template.response';
import type {
  TemplateExerciseRow,
  TemplateRow,
  TemplateSetRow,
} from './templates.repository';

export function toTemplates(
  rows: readonly TemplateRow[],
  exercises: readonly TemplateExerciseRow[],
  sets: readonly TemplateSetRow[],
): Template[] {
  const setsByExercise = groupBy(sets, (set) => set.templateExerciseId);
  const exercisesByTemplate = groupBy(exercises, (item) => item.templateId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastPerformedAt: row.lastPerformedAt?.toISOString() ?? null,
    exercises: (exercisesByTemplate.get(row.id) ?? []).map((item) => ({
      exerciseId: item.exerciseId,
      name: item.name,
      image: item.imageKeys[0] ?? null,
      type: item.type,
      custom: item.custom,
      archived: item.archived,
      notes: item.notes,
      restSeconds: item.restSeconds,
      sets: (setsByExercise.get(item.id) ?? []).map(pickSetColumns),
    })),
  }));
}
