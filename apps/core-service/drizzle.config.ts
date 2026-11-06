import { defineConfig } from 'drizzle-kit';

// Used by `drizzle-kit generate` only (dev tool, not in the prod image).
// Migrations of this service live in the `core` schema and never touch other schemas
// (for example neon_auth).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './src/db/migrations',
  schemaFilter: ['core'],
  migrations: { schema: 'core' },
});
