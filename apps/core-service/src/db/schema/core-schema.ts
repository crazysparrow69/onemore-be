import { pgSchema } from 'drizzle-orm/pg-core';

// Tables are always addressed through this schema object, never through search_path:
// the Neon pooler (transaction mode) does not keep session parameters.
export const coreSchema = pgSchema('core');
