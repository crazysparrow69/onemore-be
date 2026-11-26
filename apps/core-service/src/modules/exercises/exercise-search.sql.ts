import { sql, type SQL } from 'drizzle-orm';
import type { Equipment, PrimaryMuscle } from '../../db/schema/exercises';
import type { Locale } from '../../db/schema/locales';
import { TRANSLATE_FROM, TRANSLATE_TO } from './exercise-text';
import type { SearchPlan, SearchWord } from './exercise-search';
import { textArray } from './exercise-sql';

export type ExerciseSearch = {
  userId: string;
  locale: Locale;
  plan: SearchPlan;
  muscles: readonly PrimaryMuscle[];
  equipment: readonly Equipment[];
  mine: boolean;
  limit: number;
  offset: number;
};

export function normalized(column: SQL): SQL {
  return sql`translate(lower(${column}), ${TRANSLATE_FROM}, ${TRANSLATE_TO})`;
}

function every(conditions: SQL[]): SQL {
  return sql`(${sql.join(conditions, sql` and `)})`;
}

function wordInNames(word: SearchWord): SQL {
  return sql`d.names like any (${textArray(word.patterns)})`;
}

function wordInDocument(word: SearchWord): SQL {
  return sql`d.doc like any (${textArray(word.patterns)})`;
}

function wordInPrimaryTags(word: SearchWord): SQL {
  const parts: SQL[] = [];
  if (word.muscles.length > 0) {
    parts.push(sql`e.primary_muscles && ${textArray(word.muscles)}`);
  }
  if (word.equipment.length > 0) {
    parts.push(sql`e.equipment = any (${textArray(word.equipment)})`);
  }
  return parts.length === 0 ? sql`false` : sql`(${sql.join(parts, sql` or `)})`;
}

function wordInSecondaryTags(word: SearchWord): SQL {
  return word.muscles.length === 0
    ? sql`false`
    : sql`e.secondary_muscles && ${textArray(word.muscles)}`;
}

function wordInNamesOrPrimaryTags(word: SearchWord): SQL {
  return sql`(${wordInNames(word)} or ${wordInPrimaryTags(word)})`;
}

function wordInDocumentOrPrimaryTags(word: SearchWord): SQL {
  return sql`(${wordInDocument(word)} or ${wordInPrimaryTags(word)})`;
}

function wordAnywhere(word: SearchWord): SQL {
  return sql`(${wordInDocument(word)} or ${wordInPrimaryTags(word)} or ${wordInSecondaryTags(word)})`;
}

export function rankOf(plan: SearchPlan): SQL {
  if (plan.words.length === 0) {
    return sql`0`;
  }
  const startsWithPhrase = sql`${normalized(sql`n.name`)} like ${`${plan.phrase}%`}`;
  return sql`case
    when ${startsWithPhrase} then 0
    when ${every(plan.words.map(wordInNamesOrPrimaryTags))} then 1
    when ${every(plan.words.map(wordInDocumentOrPrimaryTags))} then 2
    else 3
  end`;
}

export function tagHitsOf(plan: SearchPlan): SQL {
  const hits = plan.words
    .filter((word) => word.muscles.length > 0 || word.equipment.length > 0)
    .map(
      (word) => sql`(case when ${wordInPrimaryTags(word)} then 1 else 0 end)`,
    );
  return hits.length === 0 ? sql`0` : sql`(${sql.join(hits, sql` + `)})`;
}

export function filtersOf(search: ExerciseSearch): SQL {
  const conditions: SQL[] = [];
  if (search.mine) {
    conditions.push(sql`e.owner_id = ${search.userId}`);
  }
  if (search.muscles.length > 0) {
    conditions.push(sql`e.primary_muscles && ${textArray(search.muscles)}`);
  }
  if (search.equipment.length > 0) {
    conditions.push(sql`e.equipment = any (${textArray(search.equipment)})`);
  }
  if (search.plan.words.length > 0) {
    conditions.push(every(search.plan.words.map(wordAnywhere)));
  }
  return conditions.length === 0
    ? sql``
    : sql`and ${sql.join(conditions, sql` and `)}`;
}
