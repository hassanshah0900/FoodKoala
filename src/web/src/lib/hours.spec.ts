import { weekRows } from './hours';

describe('weekRows', () => {
  it('reads each day Monday first, closed when it has no ranges', () => {
    const rows = weekRows({
      mon: [
        { opens: '11:00', closes: '15:00' },
        { opens: '18:00', closes: '02:00' },
      ],
      sun: [{ opens: '00:00', closes: '24:00' }],
    });
    expect(rows[0]).toEqual({ day: 'Monday', hours: '11:00–15:00, 18:00–02:00' });
    expect(rows[1]).toEqual({ day: 'Tuesday', hours: 'Closed' });
    expect(rows[6]).toEqual({ day: 'Sunday', hours: 'Open all day' });
  });
});
