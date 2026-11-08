import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['orders'],
  // One shared database: each service keeps its own migrations table.
  migrations: { schema: 'drizzle', table: 'order_migrations' },
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
