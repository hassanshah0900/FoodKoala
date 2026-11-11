import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddressPicker } from '@/components/checkout/AddressPicker';
import { MoneyRows } from '@/components/checkout/OrderSummary';
import { PlaceOrderForm } from '@/components/checkout/PlaceOrderForm';
import { Section } from '@/components/checkout/Section';
import { TipPicker } from '@/components/checkout/TipPicker';
import { VoucherBox } from '@/components/checkout/VoucherBox';
import { WhenPicker } from '@/components/checkout/WhenPicker';
import { ApiError } from '@/lib/api/http';
import { voucherDiscount } from '@/lib/api/orders';
import { deliveryQuote, getRestaurant, openSlots } from '@/lib/api/restaurants';
import type { VoucherDiscount } from '@/lib/api/types';
import { myAddresses } from '@/lib/api/users';
import { currentCart } from '@/lib/cart';
import { summarize } from '@/lib/cart-summary';
import { parseCheckout } from '@/lib/checkout';
import { currentLocation } from '@/lib/current-location';
import { deliveryWindow, rupees } from '@/lib/format';
import { SLOT_STEP_MINUTES, slotWindow, whenLabel } from '@/lib/schedule';
import { accessToken, requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Checkout' };

/** The voucher's discount on this cart, or why it can't be used. */
async function checkVoucher(token: string, code: string | undefined) {
  if (!code) return { applied: null, error: null };
  try {
    return { applied: await voucherDiscount(token, code), error: null };
  } catch (err) {
    if (err instanceof ApiError && [400, 409, 422].includes(err.status)) return { applied: null, error: err.message };
    throw err;
  }
}

export default async function Checkout({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser('/checkout');
  const token = (await accessToken())!;
  const choices = parseCheckout(await searchParams);
  const [cart, addresses, location] = await Promise.all([currentCart(), myAddresses(token), currentLocation()]);
  if (!cart?.restaurantId || cart.lines.length === 0) redirect('/cart');

  const address =
    addresses.find((a) => a.id === choices.addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
  const now = Date.now();
  const { from, to } = slotWindow(now);
  const [restaurant, quote, voucher, slots] = await Promise.all([
    getRestaurant(cart.restaurantId),
    address ? deliveryQuote(cart.restaurantId, address.location, choices.at) : null,
    checkVoucher(token, choices.voucher),
    // Scheduling is extra: without the slots the customer can still order for now.
    openSlots(cart.restaurantId, from, to, SLOT_STEP_MINUTES)
      .then((r) => r?.slots ?? null)
      .catch(() => null),
  ]);
  const name = restaurant?.name ?? 'This restaurant';
  const delivery = quote?.deliverable ? quote.delivery : null;
  const s = summarize(cart, delivery, {
    discountPaisa: (voucher.applied as VoucherDiscount | null)?.discountPaisa,
    tipPaisa: choices.tipPaisa,
  });

  // Problems the customer can see before pressing the button; order-service checks them all again.
  const blocked = !address
    ? 'Add an address to deliver to.'
    : !delivery
      ? `${name} doesn't deliver to ${address.area}.`
      : choices.at && slots && !slots.includes(choices.at)
        ? 'That time is no longer available. Pick another one.'
        : quote && !quote.acceptingOrders
          ? choices.at
            ? `${name} isn't taking orders then. Pick another time.`
            : `${name} isn't taking orders right now. Schedule your order for later.`
          : cart.problems.length
            ? 'Some items in your cart changed. Fix them in your cart first.'
            : s.shortOfMinimumPaisa > 0
              ? `Add ${rupees(s.shortOfMinimumPaisa)} more to reach the minimum order.`
              : null;

  return (
    <div className="bg-canvas">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <h1 className="text-3xl font-extrabold">Checkout</h1>
          <Section title="Delivery address">
            <AddressPicker addresses={addresses} choices={choices} selectedId={address?.id} location={location} />
          </Section>
          <Section title="Delivery time">
            <WhenPicker
              choices={choices}
              slots={slots}
              asap={
                delivery && quote?.acceptingOrders !== false && !choices.at
                  ? deliveryWindow(delivery.deliveryTimeMinutes)
                  : null
              }
              now={now}
            />
          </Section>
          <Section title="Voucher">
            <VoucherBox choices={choices} applied={voucher.applied} error={voucher.error} />
          </Section>
          <Section title="Tip your rider">
            <TipPicker choices={choices} />
          </Section>
          <Section title="Payment">
            <PlaceOrderForm
              orderKey={randomUUID()}
              addressId={address?.id}
              voucher={voucher.applied?.code ?? null}
              tipPaisa={choices.tipPaisa}
              scheduledFor={choices.at ?? null}
              scheduledLabel={choices.at ? whenLabel(choices.at, now) : null}
              totalPaisa={s.totalPaisa}
              blocked={blocked}
            />
          </Section>
        </div>
        <aside className="h-fit space-y-4 rounded-xl bg-white p-6 shadow-sm lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Your order</h2>
            <Link
              href={`/restaurant/${cart.restaurantId}`}
              className="text-sm font-semibold text-brand-600 hover:underline"
            >
              Edit
            </Link>
          </div>
          {restaurant && <p className="text-sm text-muted">from {restaurant.name}</p>}
          <ul className="space-y-2 text-sm">
            {cart.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span>
                  {l.quantity} × {l.name}
                  {l.options.length > 0 && (
                    <span className="block text-xs text-muted">{l.options.map((o) => o.name).join(', ')}</span>
                  )}
                </span>
                <span>{rupees(l.lineTotalPaisa)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line pt-4">
            <MoneyRows s={s} />
          </div>
        </aside>
      </div>
    </div>
  );
}
