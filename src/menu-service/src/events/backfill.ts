// Writes menu.updated for every restaurant that has a menu, so a new consumer
// (search-service) can fill itself. Safe to rerun and to run while the service is
// live: each event carries a fresh revision, and consumers keep the highest.
// `npm run events:backfill`.
import { asc, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { categories } from '../db/schema';
import { recordMenuChange } from './menu-events';

const BATCH = 200;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = drizzle(url);
  let after = '00000000-0000-0000-0000-000000000000';
  let total = 0;
  try {
    for (;;) {
      const ids = await db
        .selectDistinct({ id: categories.restaurantId })
        .from(categories)
        .where(gt(categories.restaurantId, after))
        .orderBy(asc(categories.restaurantId))
        .limit(BATCH);
      if (!ids.length) break;
      for (const { id } of ids) {
        await db.transaction(async (tx) => {
          // The same lock menu changes take, so the snapshot never sees half a change.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
          await recordMenuChange(tx, id);
        });
      }
      total += ids.length;
      after = ids[ids.length - 1].id;
    }
    console.log(JSON.stringify({ level: 'log', context: 'menu-service', message: `backfilled ${total} menus` }));
  } finally {
    await db.$client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
