import { cuisineEmoji, cuisineLabel } from './cuisines';

describe('cuisines', () => {
  it.each([
    ['fast-food', 'Fast food'],
    ['bbq', 'BBQ'],
    ['south-indian', 'South indian'],
  ])('%s reads as %s', (tag, label) => expect(cuisineLabel(tag)).toBe(label));

  it('has pictures for known cuisines only', () => {
    expect(cuisineEmoji('pizza')).toBe('🍕');
    expect(cuisineEmoji('martian')).toBeNull();
  });
});
