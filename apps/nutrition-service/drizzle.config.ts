import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './src/db/migrations',
  schemaFilter: ['nutrition'],
  migrations: { schema: 'nutrition' },
});
