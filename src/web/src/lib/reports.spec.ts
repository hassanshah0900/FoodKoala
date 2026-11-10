import { axisRupees, change, everyDay, periodOf, pktDate, ticks } from './reports';

describe('sales reports', () => {
  const now = Date.parse('2026-11-11T09:00:00Z'); // 14:00 in Pakistan

  it('starts a period at midnight in Pakistan and compares it with as long a stretch before', () => {
    const p = periodOf(7, now);
    expect(p.from).toBe('2026-11-04T19:00:00.000Z'); // 5 Nov, 00:00 PKT
    expect(p.to).toBe('2026-11-11T09:00:00.000Z');
    expect(p.previous).toEqual({ from: '2026-10-29T05:00:00.000Z', to: '2026-11-04T19:00:00.000Z' });
  });

  it('dates instants in Pakistan time', () => expect(pktDate(Date.parse('2026-11-10T20:00:00Z'))).toBe('2026-11-11'));

  it('fills the days without orders with zeros', () => {
    const p = periodOf(7, now);
    const days = everyDay({ ...p, days: [{ date: '2026-11-07', placed: 3, delivered: 2, salesPaisa: 120000 }] });
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ]);
    expect(days[2].salesPaisa).toBe(120000);
    expect(days[0]).toEqual({ date: '2026-11-05', placed: 0, delivered: 0, salesPaisa: 0 });
  });

  it('gives the change in percent, or none when there was nothing before', () => {
    expect(change(150, 100)).toBe(50);
    expect(change(80, 100)).toBe(-20);
    expect(change(5, 0)).toBeNull();
  });

  it('picks round ticks', () => {
    expect(ticks(7300)).toEqual([0, 2000, 4000, 6000, 8000]);
    expect(ticks(90)).toEqual([0, 50, 100]);
    expect(ticks(0)).toEqual([0]);
  });

  it.each([
    [90000, 'Rs 900'],
    [1200000, 'Rs 12K'],
    [150000000, 'Rs 1.5M'],
  ])('%i paisa on an axis is %s', (paisa, text) => expect(axisRupees(paisa)).toBe(text));
});
