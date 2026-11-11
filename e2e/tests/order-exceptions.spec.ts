// When an order doesn't go ahead: the customer changes their mind, or the kitchen can't take it.

import { expect, test } from '../support/fixtures.ts';
import { signIn } from '../support/people.ts';
import { near } from '../support/places.ts';
import { reloadUntilVisible } from '../support/reload.ts';
import { fillCartAndCheckout, placeOrder } from '../support/shop.ts';
import { openRestaurant } from '../support/world.ts';

test('a customer cancels an order the kitchen has not accepted yet', async ({ phone }) => {
  const restaurant = await openRestaurant();
  const customer = await phone({ person: await signIn(), at: near(restaurant.at, 500, 500) });
  await fillCartAndCheckout(customer, restaurant);
  await placeOrder(customer);

  await customer.getByRole('button', { name: 'Cancel order' }).click();
  await customer.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(customer.getByRole('heading', { name: 'This order was cancelled' })).toBeVisible();

  const kitchen = await phone({ person: restaurant.owner });
  await kitchen.goto(`/vendor/${restaurant.id}`);
  await expect(kitchen.getByRole('heading', { level: 1, name: restaurant.name })).toBeVisible();
  await expect(kitchen.getByRole('button', { name: 'Accept' })).toHaveCount(0);
});

test('the kitchen turns an order down and the customer sees why', async ({ phone }) => {
  const restaurant = await openRestaurant();
  const customer = await phone({ person: await signIn(), at: near(restaurant.at, -400, 700) });
  await fillCartAndCheckout(customer, restaurant);
  await placeOrder(customer);

  const kitchen = await phone({ person: restaurant.owner });
  await kitchen.goto(`/vendor/${restaurant.id}`);
  await kitchen.getByText("Can't take it…").click();
  await kitchen.getByLabel('An item in the order is out of stock').check();
  await kitchen.getByRole('button', { name: 'Reject order' }).click();
  await expect(kitchen.getByRole('button', { name: 'Accept' })).toHaveCount(0);

  await reloadUntilVisible(
    customer,
    customer.getByRole('heading', { name: `${restaurant.name} couldn't take your order` }),
  );
  await expect(customer.getByText('An item in the order is out of stock')).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
});
