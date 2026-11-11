import { checkoutSchema, codeQuerySchema, idempotencyKeySchema, restaurantOrdersQuerySchema } from './orders.dto';

describe('codeQuerySchema', () => {
  it.each(['950C29C4', '#950c29c4', ' 950c29C4 '])('reads %s as lower-case hex', (code) => {
    expect(codeQuerySchema.parse({ code }).code).toBe('950c29c4');
  });

  it.each(['950C29C', '950C29C4A', 'ZZZZZZZZ', ''])('rejects %s', (code) => {
    expect(codeQuerySchema.safeParse({ code }).success).toBe(false);
  });
});

describe('idempotencyKeySchema', () => {
  it.each(['3f1c2b8a-9d10-4c55', 'checkout_12345678'])('accepts %s', (key) => {
    expect(idempotencyKeySchema.safeParse(key).success).toBe(true);
  });

  it.each(['short', 'has space in it', 'x'.repeat(65), undefined])('rejects %s', (key) => {
    expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('checkoutSchema', () => {
  const addressId = '7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10';

  it('reads scheduledFor as a date, null for as soon as possible', () => {
    expect(checkoutSchema.parse({ addressId, paymentMethod: 'cod' }).scheduledFor).toBeNull();
    expect(
      checkoutSchema.parse({ addressId, paymentMethod: 'cod', scheduledFor: '2026-11-11T19:30:00+05:00' }).scheduledFor,
    ).toEqual(new Date('2026-11-11T14:30:00Z'));
    expect(checkoutSchema.safeParse({ addressId, paymentMethod: 'cod', scheduledFor: 'tonight' }).success).toBe(false);
  });

  it('defaults the note to null and trims it', () => {
    expect(checkoutSchema.parse({ addressId, paymentMethod: 'cod' }).note).toBeNull();
    expect(checkoutSchema.parse({ addressId, paymentMethod: 'cod', note: '  no cutlery ' }).note).toBe('no cutlery');
  });

  it('rejects prices and unknown fields', () => {
    expect(checkoutSchema.safeParse({ addressId, paymentMethod: 'cod', totalPaisa: 1 }).success).toBe(false);
  });

  it('rejects an unknown payment method', () => {
    expect(checkoutSchema.safeParse({ addressId, paymentMethod: 'bitcoin' }).success).toBe(false);
  });
});

describe('restaurantOrdersQuerySchema', () => {
  it('splits and de-duplicates statuses', () => {
    expect(restaurantOrdersQuerySchema.parse({ status: 'placed, accepted,placed' })).toEqual({
      status: ['placed', 'accepted'],
      page: 1,
      limit: 20,
    });
  });

  it('leaves the status filter out when not given', () => {
    expect(restaurantOrdersQuerySchema.parse({}).status).toBeUndefined();
  });

  it.each(['cooking', ',', 'placed,eaten'])('rejects status=%s', (status) => {
    expect(restaurantOrdersQuerySchema.safeParse({ status }).success).toBe(false);
  });
});
