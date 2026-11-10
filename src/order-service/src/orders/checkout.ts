import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { Address, Cart, DeliveryQuote, Restaurant } from '../clients/clients';
import type { DeliveryAddress, LineOption, PaymentMethod } from '../db/schema';
import { rupees } from '../money';

/** Until payment-service takes online payments, only cash on delivery is offered. */
export const ACCEPTED_PAYMENT_METHODS: readonly PaymentMethod[] = ['cod'];

/** Everything needed to save the order, decided before anything is written. */
export interface OrderDraft {
  restaurantId: string;
  restaurantName: string;
  restaurantLocation: { lat: number; lng: number };
  deliveryZoneId: string;
  deliveryAddress: DeliveryAddress;
  lines: {
    itemId: string;
    name: string;
    quantity: number;
    options: LineOption[];
    note: string | null;
    unitPricePaisa: number;
    lineTotalPaisa: number;
  }[];
  subtotalPaisa: number;
  deliveryFeePaisa: number;
  voucherId: string | null;
  discountPaisa: number;
  totalPaisa: number;
  estimatedDeliveryAt: Date;
}

/** 409 for a cart with nothing to order. */
export function assertCartNotEmpty(cart: Cart): asserts cart is Cart & { restaurantId: string } {
  if (cart.restaurantId === null || cart.lines.length === 0) throw new ConflictException('Your cart is empty');
}

/** Fails before any other service is asked: an empty cart or a payment method we can't take yet. */
export function checkCart(cart: Cart, paymentMethod: PaymentMethod): asserts cart is Cart & { restaurantId: string } {
  assertCartNotEmpty(cart);
  const problems = cart.problems.map((p) => p.message);
  if (!ACCEPTED_PAYMENT_METHODS.includes(paymentMethod)) {
    problems.push('Only cash on delivery is available for now');
  }
  if (problems.length) throw new UnprocessableEntityException(problems);
}

/**
 * Whether the order can be placed, and what it costs. 422 for what the
 * customer can fix (address, minimum order), 409 for a restaurant that isn't
 * taking orders, which no change to the cart or address would fix.
 */
export function draftOrder(input: {
  cart: Cart & { restaurantId: string };
  address: Address | null;
  restaurant: Restaurant | null;
  quote: DeliveryQuote | null;
  now: Date;
}): OrderDraft {
  const { cart, address, restaurant, quote, now } = input;
  if (!address) throw new UnprocessableEntityException(['Choose one of your saved addresses']);
  if (!restaurant || !quote) throw new ConflictException('This restaurant is not taking orders any more');
  if (!quote.acceptingOrders) throw new ConflictException(`${restaurant.name} is not taking orders right now`);
  if (!quote.deliverable || !quote.delivery) {
    throw new UnprocessableEntityException([`${restaurant.name} doesn't deliver to ${address.area}, ${address.city}`]);
  }

  const { delivery } = quote;
  const lines = cart.lines.map((l) => ({
    itemId: l.itemId,
    name: l.name,
    quantity: l.quantity,
    options: l.options,
    note: l.note,
    unitPricePaisa: l.unitPricePaisa,
    lineTotalPaisa: l.unitPricePaisa * l.quantity,
  }));
  const subtotalPaisa = lines.reduce((sum, l) => sum + l.lineTotalPaisa, 0);
  if (subtotalPaisa < delivery.minimumOrderPaisa) {
    throw new UnprocessableEntityException([
      `The minimum order here is ${rupees(delivery.minimumOrderPaisa)}; add ${rupees(delivery.minimumOrderPaisa - subtotalPaisa)} more`,
    ]);
  }

  return {
    restaurantId: cart.restaurantId,
    restaurantName: restaurant.name,
    restaurantLocation: { lat: restaurant.location.lat, lng: restaurant.location.lng },
    deliveryZoneId: delivery.zoneId,
    deliveryAddress: {
      label: address.labelText ?? address.label,
      line1: address.line1,
      area: address.area,
      city: address.city,
      landmark: address.landmark,
      instructions: address.instructions,
      location: { lat: address.location.lat, lng: address.location.lng },
    },
    lines,
    subtotalPaisa,
    deliveryFeePaisa: delivery.deliveryFeePaisa,
    voucherId: null,
    discountPaisa: 0,
    totalPaisa: subtotalPaisa + delivery.deliveryFeePaisa,
    estimatedDeliveryAt: new Date(now.getTime() + delivery.deliveryTimeMinutes * 60_000),
  };
}

/** The draft with a voucher's discount taken off its total. */
export function withDiscount(draft: OrderDraft, voucher: { voucherId: string; discountPaisa: number }): OrderDraft {
  return {
    ...draft,
    voucherId: voucher.voucherId,
    discountPaisa: voucher.discountPaisa,
    totalPaisa: draft.subtotalPaisa + draft.deliveryFeePaisa - voucher.discountPaisa,
  };
}
