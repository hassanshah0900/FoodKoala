// The journey FoodKoala exists for: a customer orders, the kitchen cooks, a
// rider brings it, they talk on the way, and the customer rates it.

import { expect, test } from '../support/fixtures.ts';
import { signIn } from '../support/people.ts';
import { near } from '../support/places.ts';
import { reloadUntilVisible } from '../support/reload.ts';
import { addToCart, checkoutWithNewAddress, deliverHere, openFromListing, placeOrder } from '../support/shop.ts';
import { openRestaurant, riderOnShift } from '../support/world.ts';

test('an order goes from checkout to the door, with a chat on the way and a rating at the end', async ({ phone }) => {
  const restaurant = await openRestaurant();
  const rider = await riderOnShift(restaurant.at);
  const home = near(restaurant.at, 800, 600);

  const customer = await phone({ person: await signIn(), at: home });
  await deliverHere(customer);
  await openFromListing(customer, restaurant);
  await addToCart(customer, restaurant.biryani, 'Full');
  await addToCart(customer, restaurant.raita);
  await checkoutWithNewAddress(customer);
  // 650 + 300 for Full + 80 raita + 99 delivery
  await expect(customer.getByRole('button', { name: /^Place order/ })).toHaveText(/Rs\.? ?1,129/);
  await placeOrder(customer);
  await expect(
    customer.getByRole('heading', { name: `Waiting for ${restaurant.name} to accept your order` }),
  ).toBeVisible();

  const kitchen = await phone({ person: restaurant.owner });
  await kitchen.goto(`/vendor/${restaurant.id}`);
  await kitchen.getByRole('button', { name: 'Accept' }).click();
  await kitchen.getByRole('button', { name: 'Food is ready' }).click();
  await expect(kitchen.getByText('Waiting for the rider to pick it up.')).toBeVisible();

  const riderPhone = await phone({ person: rider, at: near(restaurant.at, 300, 200) });
  await riderPhone.goto('/rider');
  // Offered to the nearest rider within seconds; the page checks every 10.
  await expect(riderPhone.getByRole('button', { name: 'I have the food' })).toBeVisible({ timeout: 30_000 });
  await expect(riderPhone.getByText(restaurant.name)).toBeVisible();

  await riderPhone.getByLabel('Message').fill('Salam! Collecting your biryani now.');
  await riderPhone.getByRole('button', { name: 'Send', exact: true }).click();
  await riderPhone.getByRole('button', { name: 'I have the food' }).click();
  await expect(riderPhone.getByRole('button', { name: 'Delivered' })).toBeVisible();

  await reloadUntilVisible(customer, customer.getByRole('heading', { name: 'Your rider is on the way' }));
  const chat = customer
    .locator('section')
    .filter({ has: customer.getByRole('heading', { name: `Chat with ${rider.name.split(' ')[0]}` }) });
  await expect(chat.getByText('Salam! Collecting your biryani now.')).toBeVisible();
  await chat.getByLabel('Message').fill('Great, the gate is open.');
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  // Arrives on the rider's open page without a reload.
  await expect(riderPhone.getByText('Great, the gate is open.')).toBeVisible();

  await riderPhone.getByRole('button', { name: 'Delivered' }).click();

  await reloadUntilVisible(customer, customer.getByRole('heading', { name: 'Delivered. Enjoy your meal!' }));
  await customer.getByRole('group', { name: 'The food' }).locator('label', { hasText: '5 stars' }).click();
  await customer.getByRole('group', { name: 'Your rider' }).locator('label', { hasText: '5 stars' }).click();
  await customer.getByLabel(/Anything to add/).fill('Hot and on time.');
  await customer.getByRole('button', { name: 'Send rating' }).click();
  await expect(customer.getByRole('heading', { name: 'Your rating' })).toBeVisible();
});
