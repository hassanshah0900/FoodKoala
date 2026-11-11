import { directions, nextStep } from './rider';

describe('rider', () => {
  it('links to directions', () =>
    expect(directions({ lat: 24.913, lng: 67.098 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=24.913,67.098',
    ));

  it('heads to the restaurant, then to the customer', () => {
    expect(nextStep({ status: 'assigned', foodReadyAt: null })).toMatchObject({
      step: 'pickup',
      heading: 'restaurant',
      note: 'The kitchen is still preparing it.',
    });
    expect(nextStep({ status: 'assigned', foodReadyAt: '2026-11-11T10:00:00Z' })?.note).toBe('The food is ready.');
    expect(nextStep({ status: 'picked_up', foodReadyAt: null })).toMatchObject({
      step: 'dropoff',
      heading: 'customer',
    });
    expect(nextStep({ status: 'delivered', foodReadyAt: null })).toBeNull();
  });
});
