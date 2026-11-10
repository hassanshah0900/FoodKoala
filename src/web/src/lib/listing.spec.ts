import { listingHref, parseListing } from './listing';

describe('listing filters', () => {
  it('reads the URL, falling back to defaults', () => {
    expect(parseListing({})).toEqual({ q: undefined, cuisine: undefined, sort: 'relevance', page: 1 });
    expect(parseListing({ q: ' biryani ', cuisine: 'BBQ', sort: 'rating', page: '3' })).toEqual({
      q: 'biryani',
      cuisine: 'bbq',
      sort: 'rating',
      page: 3,
    });
    expect(parseListing({ sort: 'price', page: '0' })).toMatchObject({ sort: 'relevance', page: 1 });
    expect(parseListing({ page: '2.5', q: ['a', 'b'] })).toMatchObject({ page: 1, q: 'a' });
  });

  it('writes only what differs from the defaults, and resets the page', () => {
    const current = parseListing({ q: 'karahi', page: '4' });
    expect(listingHref(current, { sort: 'distance' })).toBe('/restaurants?q=karahi&sort=distance');
    expect(listingHref(current, { page: 5 })).toBe('/restaurants?q=karahi&page=5');
    expect(listingHref(current, { q: undefined })).toBe('/restaurants');
  });
});
