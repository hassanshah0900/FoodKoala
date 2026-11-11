// A chat message nobody reads doesn't go unseen: after a minute the customer
// gets a text, and the bell in the app leads them back to the chat.

import { call } from '../support/api.ts';
import { expect, test } from '../support/fixtures.ts';
import { signIn } from '../support/people.ts';
import { near } from '../support/places.ts';
import { fillCartAndCheckout, placeOrder } from '../support/shop.ts';
import { waitForText } from '../support/sms.ts';
import { openRestaurant, riderOnShift } from '../support/world.ts';

test("a rider's unread message reaches the customer by SMS and the bell", async ({ phone }) => {
  // chat-service waits a minute before it nudges, then checks every so often.
  test.setTimeout(240_000);
  const restaurant = await openRestaurant();
  const rider = await riderOnShift(restaurant.at);
  const person = await signIn();

  const customer = await phone({ person, at: near(restaurant.at, -700, 400) });
  await fillCartAndCheckout(customer, restaurant);
  const orderId = await placeOrder(customer);
  await call('POST', `orders/${orderId}/status`, {
    token: restaurant.owner.accessToken,
    body: { status: 'accepted', prepTimeMinutes: 20 },
  });
  // The customer puts the phone away.
  await customer.goto('/restaurants');

  const riderPhone = await phone({ person: rider, at: near(restaurant.at, 300, 200) });
  await riderPhone.goto('/rider');
  await expect(riderPhone.getByRole('heading', { name: 'Chat with the customer' })).toBeVisible({ timeout: 30_000 });
  await riderPhone.getByLabel('Message').fill('Which gate should I use?');
  await riderPhone.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(riderPhone.getByText('Which gate should I use?')).toBeVisible();

  const sms = await waitForText(person.phone, /your rider, sent you "Which gate should I use\?"/, 0, 150_000);
  expect(sms.body).toContain(rider.name.split(' ')[0]);

  // The bell polls every 30 seconds; a reload shows the count now.
  await customer.reload();
  const bell = customer.getByRole('link', { name: /^Notifications, \d+ unread$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await customer
    .getByRole('button', { name: /Message from/ })
    .first()
    .click();
  await customer.waitForURL(`**/orders/${orderId}**`);
  await expect(customer.getByText('Which gate should I use?')).toBeVisible();
});
