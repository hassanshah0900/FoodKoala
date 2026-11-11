import { describe, expect, it } from 'vitest';
import type { Tracking } from './api/types';
import { arrivalLine, isTracking, mapPins, newer, riderLine, showTracking, staleLine, vehicleLabel } from './tracking';

const base: Tracking = {
  orderId: '950c29c4-0000-4000-8000-000000000000',
  status: 'to_restaurant',
  restaurant: { lat: 24.9, lng: 67.1 },
  dropoff: { lat: 24.92, lng: 67.09 },
  rider: { id: 'r1', name: 'Imran Ali', phone: '+923000000031', vehicle: 'motorbike' },
  riderLocation: { lat: 24.89, lng: 67.11, at: '2026-11-11T08:00:00Z' },
  remainingMeters: 2400,
  eta: '2026-11-11T08:42:00Z',
  version: 4,
  updatedAt: '2026-11-11T08:00:00Z',
};

describe('isTracking', () => {
  it('is on until the order is finished', () => {
    expect(isTracking(base)).toBe(true);
    expect(isTracking({ ...base, status: 'delivered' })).toBe(false);
    expect(isTracking({ ...base, status: 'cancelled' })).toBe(false);
  });
});

describe('showTracking', () => {
  it('needs a rider', () => {
    expect(showTracking(base)).toBe(true);
    expect(showTracking({ ...base, status: 'waiting_for_rider', rider: null })).toBe(false);
  });

  it('stops once delivered', () => {
    expect(showTracking({ ...base, status: 'delivered' })).toBe(false);
  });
});

describe('newer', () => {
  it('keeps the higher version whichever comes first', () => {
    const later = { ...base, version: 5 };
    expect(newer(base, later)).toBe(later);
    expect(newer(later, base)).toBe(later);
  });
});

describe('riderLine', () => {
  it('uses the rider’s first name', () => {
    expect(riderLine(base)).toBe('Imran is heading to the restaurant');
    expect(riderLine({ ...base, status: 'to_customer' })).toBe('Imran is on the way to you');
  });

  it('says it is still looking before a rider is assigned', () => {
    expect(riderLine({ ...base, status: 'waiting_for_rider', rider: null })).toBe('Finding a rider for your order');
  });
});

describe('arrivalLine', () => {
  it('gives the time in Pakistan and the distance left', () => {
    expect(arrivalLine(base)).toBe('Arriving around 13:42 · 2.4 km away');
  });

  it('is null before the first position', () => {
    expect(arrivalLine({ ...base, eta: null, remainingMeters: null })).toBeNull();
  });
});

describe('staleLine', () => {
  const at = Date.parse('2026-11-11T08:00:00Z');

  it('is null while positions are fresh', () => {
    expect(staleLine(base, at + 60_000)).toBeNull();
  });

  it('says when the rider was last seen once the phone goes quiet', () => {
    expect(staleLine(base, at + 5 * 60_000)).toBe('Last seen 5 min ago');
  });

  it('is null with no position yet', () => {
    expect(staleLine({ ...base, riderLocation: null }, at)).toBeNull();
  });
});

describe('vehicleLabel', () => {
  it('reads the vehicle as people say it', () => {
    expect(vehicleLabel('motorbike')).toBe('Motorbike');
  });
});

describe('mapPins', () => {
  it('shows the restaurant, the door and the rider on the way to collect', () => {
    expect(mapPins(base).map((p) => p.kind)).toEqual(['restaurant', 'home', 'rider']);
  });

  it('drops the restaurant once the food is collected', () => {
    expect(mapPins({ ...base, status: 'to_customer' }).map((p) => p.kind)).toEqual(['home', 'rider']);
  });

  it('has no rider pin before the first position', () => {
    expect(mapPins({ ...base, riderLocation: null }).map((p) => p.kind)).toEqual(['restaurant', 'home']);
  });
});
