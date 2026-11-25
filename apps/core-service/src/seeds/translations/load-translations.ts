import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { LOCALES, type Locale } from '../../db/schema';
import type { SeedExercise } from '../exercises/map-exercise';
import {
  BASE_LOCALE,
  baseTranslationFileSchema,
  fullTranslationFileSchema,
} from './translations.schema';

export type TranslationRow = {
  exerciseId: string;
  locale: Locale;
  name: string | null;
  instructions: string[] | null;
  aliases: string[];
};

export type TranslationFiles = Record<string, unknown>;

export function readTranslationFiles(folder: string): TranslationFiles {
  if (!existsSync(folder)) {
    throw new Error(`Translations folder not found: ${folder}`);
  }
  const files: TranslationFiles = {};
  for (const file of readdirSync(folder)) {
    if (extname(file) === '.json') {
      files[basename(file, '.json')] = JSON.parse(
        readFileSync(join(folder, file), 'utf8'),
      );
    }
  }
  return files;
}

export function buildTranslations(
  files: TranslationFiles,
  seed: SeedExercise[],
): TranslationRow[] {
  const locales = Object.keys(files);
  if (locales.length === 0) {
    throw new Error('No translation files found');
  }
  const unknownLocales = locales.filter(
    (locale) => !(LOCALES as readonly string[]).includes(locale),
  );
  if (unknownLocales.length > 0) {
    throw new Error(
      `Translation files for unknown locales: ${unknownLocales.join(', ')}`,
    );
  }
  const bySourceId = new Map(
    seed.map((exercise) => [exercise.sourceId, exercise]),
  );
  const rows: TranslationRow[] = [];
  const issues: string[] = [];

  for (const locale of locales as Locale[]) {
    const isBase = locale === BASE_LOCALE;
    const parsed = (
      isBase ? baseTranslationFileSchema : fullTranslationFileSchema
    ).safeParse(files[locale]);
    if (!parsed.success) {
      issues.push(`${locale}: ${formatZod(parsed.error)}`);
      continue;
    }
    const entries = parsed.data as Record<
      string,
      { name?: string; instructions?: string[]; aliases: string[] }
    >;

    for (const sourceId of Object.keys(entries)) {
      if (!bySourceId.has(sourceId)) {
        issues.push(`${locale}: unknown exercise ${sourceId}`);
      }
    }
    if (!isBase) {
      const missing = seed.filter(
        (exercise) => !(exercise.sourceId in entries),
      );
      if (missing.length > 0) {
        issues.push(
          `${locale}: ${missing.length} exercises have no translation, first: ${missing
            .slice(0, 5)
            .map((exercise) => exercise.sourceId)
            .join(', ')}`,
        );
      }
    }

    for (const [sourceId, entry] of Object.entries(entries)) {
      const exercise = bySourceId.get(sourceId);
      if (!exercise) {
        continue;
      }
      const problems = checkEntry(isBase, exercise, entry);
      issues.push(
        ...problems.map((problem) => `${locale}/${sourceId}: ${problem}`),
      );
      rows.push({
        exerciseId: exercise.id,
        locale,
        name: isBase ? null : (entry.name ?? null),
        instructions: isBase ? null : (entry.instructions ?? null),
        aliases: entry.aliases,
      });
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid translations (${issues.length}):\n${issues.slice(0, 50).join('\n')}`,
    );
  }
  return rows;
}

function checkEntry(
  isBase: boolean,
  exercise: SeedExercise,
  entry: { name?: string; instructions?: string[]; aliases: string[] },
): string[] {
  const problems: string[] = [];
  const keys = entry.aliases.map((alias) => alias.toLowerCase());
  if (new Set(keys).size !== keys.length) {
    problems.push('duplicate aliases');
  }
  const title = (isBase ? exercise.name : (entry.name ?? '')).toLowerCase();
  if (keys.includes(title)) {
    problems.push('alias repeats the name');
  }
  if (!isBase && entry.instructions?.length !== exercise.instructions.length) {
    problems.push(
      `expected ${exercise.instructions.length} instruction steps, got ${entry.instructions?.length ?? 0}`,
    );
  }
  return problems;
}

function formatZod(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join('.')} ${issue.message}`)
    .join('; ');
}
