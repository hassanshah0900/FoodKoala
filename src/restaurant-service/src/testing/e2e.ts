// Shared by the e2e specs: a booted app, fresh users, and sample restaurant data.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../app.module';
import type { Database } from '../db/database';
import { outbox, restaurants } from '../db/schema';
import { setupApp } from '../setup-app';

export type Headers = Record<string, string>;

/** Fresh users as api-gateway would forward them; `ids` lists them for cleanup. */
export function userFactory() {
  const ids: string[] = [];
  const newUser = (roles = 'customer'): Headers => {
    const id = randomUUID();
    ids.push(id);
    const phone = `+923${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    return { 'X-User-Id': id, 'X-User-Phone': phone, 'X-User-Roles': roles };
  };
  return { ids, newUser };
}

/** The app on the Postgres of DATABASE_URL. */
export async function startApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = setupApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return { app, db: app.get<Database>(getDrizzleToken()), http: request(app.getHttpServer()) };
}

/** Deletes the restaurants these users own, with their zones, reviews and events. */
export async function removeRestaurantsOf(db: Database, ownerIds: string[]): Promise<void> {
  if (!ownerIds.length) return;
  const mine = await db.select({ id: restaurants.id }).from(restaurants).where(inArray(restaurants.ownerId, ownerIds));
  if (mine.length)
    await db.delete(outbox).where(
      inArray(
        outbox.key,
        mine.map((r) => r.id),
      ),
    );
  await db.delete(restaurants).where(inArray(restaurants.ownerId, ownerIds));
}

export const application = {
  name: 'Karachi Biryani House',
  description: 'Sindhi biryani and karahi since 1998',
  cuisines: ['biryani', 'pakistani'],
  phone: '+922134567890',
  address: { line1: 'Shop 4, Block 13-D', area: 'Gulshan-e-Iqbal', city: 'Karachi', province: 'sindh' },
  location: { lat: 24.9204, lng: 67.0932 },
};

const allDay = [{ opens: '00:00', closes: '24:00' }];
export const openEveryDay = {
  weekly: { mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay, sun: allDay },
  special: [],
};

/** A rectangle as a GeoJSON polygon. */
export const box = (minLng: number, minLat: number, maxLng: number, maxLat: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ],
});

/** Gulshan-e-Iqbal and around, roughly. */
export const gulshan = box(67.07, 24.9, 67.14, 24.95);

export const zone = (area: object, deliveryFeePaisa = 9900) => ({
  name: 'Zone',
  area,
  deliveryFeePaisa,
  minimumOrderPaisa: 50000,
  deliveryTimeMinutes: 35,
});

/** Applies, adds hours and a zone, and has an admin approve it: listed to customers. */
export async function approvedRestaurant(
  http: ReturnType<typeof request>,
  owner: Headers,
  admin: Headers,
  body: object = application,
): Promise<{ id: string }> {
  const { body: r } = await http.post('/').set(owner).send(body).expect(201);
  await http.put(`/${r.id}/hours`).set(owner).send(openEveryDay).expect(200);
  await http.post(`/${r.id}/zones`).set(owner).send(zone(gulshan)).expect(201);
  await http.post(`/${r.id}/status`).set(admin).send({ status: 'approved' }).expect(200);
  return r;
}
