// Applies the SQL migrations in ./drizzle. Run as a release step (`npm run db:migrate`), not on startup.
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';

/** unique_violation or duplicate_schema, through Drizzle's error wrapper: someone else created it. */
function lostTheRace(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    const code = (e as { code?: string }).code;
    if (code === '23505' || code === '42P06') return true;
  }
  return false;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = drizzle(url);
  try {
    // Every service keeps its migrations table in the shared `drizzle` schema, and their migrate
    // containers may start together. Two concurrent `create schema if not exists` can still collide
    // (a unique violation on pg_namespace), so create it first and let the one that lost carry on.
    await db.execute(sql`create schema if not exists drizzle`).catch((err: unknown) => {
      if (!lostTheRace(err)) throw err;
    });
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
