import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import type { Database } from '../db/database';
import { deliveryZones, restaurants, type Polygon } from '../db/schema';
import type { Location } from '../geo/geo';
import type { Identity } from '../identity/identity';
import type { PageQuery } from '../restaurants/restaurants.dto';
import { RestaurantsService, type Page } from '../restaurants/restaurants.service';
import { availability } from '../restaurants/restaurants.view';
import type { ZoneCreateDto, ZoneUpdateDto } from './zones.dto';

/** API shape of DeliveryZone in the contract. */
export interface DeliveryZone {
  id: string;
  name: string;
  area: Polygon;
  deliveryFeePaisa: number;
  minimumOrderPaisa: number;
  deliveryTimeMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

/** The delivery terms of the zone a customer falls in (Delivery in the contract). */
export interface Delivery {
  zoneId: string;
  deliveryFeePaisa: number;
  minimumOrderPaisa: number;
  deliveryTimeMinutes: number;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  cuisines: string[];
  area: string;
  city: string;
  logoUrl: string | null;
  coverUrl: string | null;
  location: { lat: number; lng: number };
  distanceMeters: number;
  openNow: boolean;
  pausedUntil: Date | null;
  acceptingOrders: boolean;
  delivery: Delivery;
}

export interface DeliveryQuote {
  deliverable: boolean;
  acceptingOrders: boolean;
  distanceMeters: number;
  delivery: Delivery | null;
}

/** Zone columns, with the shape read back as GeoJSON instead of PostGIS's binary format. */
const zoneColumns = {
  id: deliveryZones.id,
  name: deliveryZones.name,
  area: sql<string>`ST_AsGeoJSON(${deliveryZones.area})`.as('area'),
  deliveryFeePaisa: deliveryZones.deliveryFeePaisa,
  minimumOrderPaisa: deliveryZones.minimumOrderPaisa,
  deliveryTimeMinutes: deliveryZones.deliveryTimeMinutes,
  createdAt: deliveryZones.createdAt,
  updatedAt: deliveryZones.updatedAt,
};

const deliveryColumns = {
  zoneId: deliveryZones.id,
  deliveryFeePaisa: deliveryZones.deliveryFeePaisa,
  minimumOrderPaisa: deliveryZones.minimumOrderPaisa,
  deliveryTimeMinutes: deliveryZones.deliveryTimeMinutes,
};

const toZone = ({ area, ...rest }: { area: string } & Omit<DeliveryZone, 'area'>): DeliveryZone => ({
  ...rest,
  area: JSON.parse(area) as Polygon,
});

const point = ({ lat, lng }: Location): SQL => sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

/** Metres between a restaurant and a point, on the earth's surface. */
const distanceFrom = (at: Location): SQL<number> =>
  sql<number>`ST_Distance(ST_SetSRID(ST_MakePoint(${restaurants.lng}, ${restaurants.lat}), 4326)::geography, ${point(at)}::geography)`;

/** When several zones contain the point, the customer gets the cheapest one. */
const cheapestFirst = [asc(deliveryZones.deliveryFeePaisa), asc(deliveryZones.minimumOrderPaisa), asc(deliveryZones.id)];

/** Turns PostGIS rejecting a shape (delivery_zones_area_valid) into a 400. */
function rethrowInvalidShape(err: unknown): never {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { constraint?: string }).constraint === 'delivery_zones_area_valid') {
      throw new BadRequestException('The zone outline crosses itself; redraw it');
    }
  }
  throw err;
}

@Injectable()
export class ZonesService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly restaurants: RestaurantsService,
  ) {}

  async list(me: Identity, restaurantId: string): Promise<DeliveryZone[]> {
    await this.restaurants.findManageable(this.db, me, restaurantId);
    const rows = await this.db
      .select(zoneColumns)
      .from(deliveryZones)
      .where(eq(deliveryZones.restaurantId, restaurantId))
      .orderBy(asc(deliveryZones.createdAt), asc(deliveryZones.id));
    return rows.map(toZone);
  }

  async create(me: Identity, restaurantId: string, dto: ZoneCreateDto): Promise<DeliveryZone> {
    return this.db
      .transaction(async (tx) => {
        // Locking the restaurant serialises zone changes, so the limit holds under concurrency.
        await this.restaurants.findManageable(tx, me, restaurantId, { lock: true });
        const [{ zones }] = await tx
          .select({ zones: count() })
          .from(deliveryZones)
          .where(eq(deliveryZones.restaurantId, restaurantId));
        if (zones >= this.config.MAX_ZONES_PER_RESTAURANT) {
          throw new ConflictException(
            `A restaurant can have up to ${this.config.MAX_ZONES_PER_RESTAURANT} delivery zones; delete one first`,
          );
        }
        const [row] = await tx
          .insert(deliveryZones)
          .values({ ...dto, restaurantId })
          .returning(zoneColumns);
        return toZone(row);
      })
      .catch(rethrowInvalidShape);
  }

  async update(me: Identity, restaurantId: string, zoneId: string, dto: ZoneUpdateDto): Promise<DeliveryZone> {
    await this.restaurants.findManageable(this.db, me, restaurantId);
    const [row] = await this.db
      .update(deliveryZones)
      .set(dto)
      .where(and(eq(deliveryZones.id, zoneId), eq(deliveryZones.restaurantId, restaurantId)))
      .returning(zoneColumns)
      .catch(rethrowInvalidShape);
    if (!row) throw new NotFoundException('Delivery zone not found');
    return toZone(row);
  }

  async remove(me: Identity, restaurantId: string, zoneId: string): Promise<void> {
    await this.restaurants.findManageable(this.db, me, restaurantId);
    const deleted = await this.db
      .delete(deliveryZones)
      .where(and(eq(deliveryZones.id, zoneId), eq(deliveryZones.restaurantId, restaurantId)))
      .returning({ id: deliveryZones.id });
    if (deleted.length === 0) throw new NotFoundException('Delivery zone not found');
  }

  /** Approved restaurants with a zone containing `at`, nearest first. */
  async deliveringTo(at: Location, { page, limit }: PageQuery): Promise<Page<RestaurantSummary>> {
    const best = this.db
      .select(deliveryColumns)
      .from(deliveryZones)
      .where(and(eq(deliveryZones.restaurantId, restaurants.id), sql`ST_Covers(${deliveryZones.area}, ${point(at)})`))
      .orderBy(...cheapestFirst)
      .limit(1)
      .as('best');
    const distance = distanceFrom(at);

    const rows = await this.db
      .select({
        restaurant: restaurants,
        delivery: {
          zoneId: best.zoneId,
          deliveryFeePaisa: best.deliveryFeePaisa,
          minimumOrderPaisa: best.minimumOrderPaisa,
          deliveryTimeMinutes: best.deliveryTimeMinutes,
        },
        distance: distance.as('distance'),
      })
      .from(restaurants)
      .innerJoinLateral(best, sql`true`)
      .where(eq(restaurants.status, 'approved'))
      .orderBy(distance, asc(restaurants.id))
      .limit(limit + 1)
      .offset((page - 1) * limit);

    const now = new Date();
    return {
      items: rows.slice(0, limit).map(({ restaurant: r, delivery, distance }) => ({
        id: r.id,
        name: r.name,
        cuisines: r.cuisines,
        area: r.area,
        city: r.city,
        logoUrl: r.logoUrl,
        coverUrl: r.coverUrl,
        location: { lat: r.lat, lng: r.lng },
        distanceMeters: Math.round(distance),
        ...availability(r, now),
        delivery,
      })),
      page,
      limit,
      hasMore: rows.length > limit,
    };
  }

  /** Whether an approved restaurant delivers to `at`, on which terms. */
  async quote(restaurantId: string, at: Location): Promise<DeliveryQuote> {
    const [found] = await this.db
      .select({ restaurant: restaurants, distance: distanceFrom(at).as('distance') })
      .from(restaurants)
      .where(and(eq(restaurants.id, restaurantId), eq(restaurants.status, 'approved')));
    if (!found) throw new NotFoundException('Restaurant not found');

    const [delivery] = await this.db
      .select(deliveryColumns)
      .from(deliveryZones)
      .where(and(eq(deliveryZones.restaurantId, restaurantId), sql`ST_Covers(${deliveryZones.area}, ${point(at)})`))
      .orderBy(...cheapestFirst)
      .limit(1);

    return {
      deliverable: !!delivery,
      acceptingOrders: availability(found.restaurant, new Date()).acceptingOrders,
      distanceMeters: Math.round(found.distance),
      delivery: delivery ?? null,
    };
  }
}
