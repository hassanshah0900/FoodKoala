// Applies the SQL migrations in ./drizzle. Run as a release step (`npm run db:migrate`), not on startup.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = drizzle(url);
  try {
    await migrate(db, {
      migrationsFolder: join(__dirname, '..', '..', 'drizzle'),
      // One shared database: each service keeps its own migrations table.
      migrationsSchema: 'drizzle',
      migrationsTable: 'order_migrations',
    });
    console.log(JSON.stringify({ level: 'log', context: 'order-service', message: 'migrations applied' }));
  } finally {
    await db.$client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
