// Writes restaurant.updated for every restaurant, so a new consumer (search-service)
// can fill itself. Safe to rerun and to run while the service is live: each event
// carries a fresh revision, and consumers keep the highest. `npm run events:backfill`.
import { asc, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { restaurants } from '../db/schema';
import { recordRestaurantChange } from './restaurant-events';

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
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(gt(restaurants.id, after))
        .orderBy(asc(restaurants.id))
        .limit(BATCH);
      if (!ids.length) break;
      // One transaction per restaurant: each holds its row lock only briefly.
      for (const { id } of ids) await db.transaction((tx) => recordRestaurantChange(tx, id));
      total += ids.length;
      after = ids[ids.length - 1].id;
    }
    console.log(JSON.stringify({ level: 'log', context: 'restaurant-service', message: `backfilled ${total} restaurants` }));
  } finally {
    await db.$client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
