// Ordering for later: the kitchen sees it coming but can't start it until 45 minutes before.

import { expect, test } from '../support/fixtures.ts';
import { signIn } from '../support/people.ts';
import { near } from '../support/places.ts';
import { fillCartAndCheckout, placeOrder } from '../support/shop.ts';
import { openRestaurant } from '../support/world.ts';

test('a customer schedules an order and the kitchen holds it until it is due', async ({ phone }) => {
  const restaurant = await openRestaurant();
  const customer = await phone({ person: await signIn(), at: near(restaurant.at, 600, -300) });
  await fillCartAndCheckout(customer, restaurant);

  // The last slot offered, a day or more ahead, well past the 45 minutes before release.
  const when = customer.getByLabel('Schedule for');
  const last = await when.locator('option').last().getAttribute('value');
  await when.selectOption(last!);
  await customer.getByRole('button', { name: 'Schedule', exact: true }).click();
  await placeOrder(customer, /^Schedule for/);
  await expect(customer.getByRole('heading', { name: /^Scheduled for / })).toBeVisible();

  const kitchen = await phone({ person: restaurant.owner });
  await kitchen.goto(`/vendor/${restaurant.id}`);
  await expect(kitchen.getByRole('heading', { name: /^Scheduled/ })).toBeVisible();
  await expect(kitchen.getByText(/^To accept from /)).toBeVisible();
  await expect(kitchen.getByRole('button', { name: 'Accept' })).toHaveCount(0);

  // Still the customer's to call off.
  await customer.getByRole('button', { name: 'Cancel order' }).click();
  await customer.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(customer.getByRole('heading', { name: 'This order was cancelled' })).toBeVisible();
});
