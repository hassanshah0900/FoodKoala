import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['restaurants'],
  // One shared database: each service keeps its own migrations table.
  migrations: { schema: 'drizzle', table: 'restaurants_migrations' },
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
