import type { Locale } from '../../../db/schema/locales';
import type { Dictionary } from './dictionary';
import { en } from './en';
import { uk } from './uk';

export { MUSCLE_GROUPS } from './dictionary';
export type { Dictionary, MuscleGroup } from './dictionary';

export const DICTIONARIES: Record<Locale, Dictionary> = { en, uk };
