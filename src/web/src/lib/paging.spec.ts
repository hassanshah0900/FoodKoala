import { countLabel, pageHref, pageParam } from './paging';

describe('paging', () => {
  it('counts a page, with + when there are more', () => {
    expect(countLabel({ items: [1, 2], page: 1, limit: 20, hasMore: false })).toBe('2');
    expect(countLabel({ items: [1, 2], page: 1, limit: 2, hasMore: true })).toBe('2+');
  });

  it('keeps the other filters and leaves page 1 out', () => {
    expect(pageHref('/admin/riders', { status: 'pending', page: '3' }, 2)).toBe('/admin/riders?status=pending&page=2');
    expect(pageHref('/admin/riders', { status: undefined, page: '2' }, 1)).toBe('/admin/riders');
  });

  it.each([
    [undefined, 1],
    ['3', 3],
    ['0', 1],
    ['abc', 1],
    ['2.7', 2],
  ])('reads ?page=%s as %i', (raw, page) => expect(pageParam(raw)).toBe(page));
});
