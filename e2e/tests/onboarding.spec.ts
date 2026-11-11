// How the two sides of the marketplace join: a restaurant sets itself up and
// is approved, a rider applies and is approved, and each can then do business.

import { expect, test } from '../support/fixtures.ts';
import { signIn, signInAdmin } from '../support/people.ts';
import { near, newSpot } from '../support/places.ts';
import { deliverHere, openFromListing } from '../support/shop.ts';

test('a restaurant sets up its menu, hours and zone, is approved, and customers find it', async ({ phone }) => {
  const at = newSpot();
  const owner = await signIn();
  const name = `Lahori Karahi ${owner.phone.slice(-4)}`;

  const vendor = await phone({ person: owner });
  await vendor.goto('/vendor/new');
  await vendor.getByLabel('Restaurant name').fill(name);
  await vendor.getByLabel('Phone for riders and FoodKoala').fill(`0${owner.phone.slice(3)}`);
  await vendor.getByText('Karahi', { exact: false }).first().click();
  await vendor.getByLabel('Street address').fill('Shop 7, Food Street');
  await vendor.getByLabel('Area', { exact: true }).fill('Gulberg');
  await vendor.getByLabel('City', { exact: true }).fill('Testpur');
  await vendor.getByLabel('Province').selectOption('punjab');
  await vendor.getByLabel(/Where it is on the map/).fill(`${at.lat}, ${at.lng}`);
  await vendor.getByRole('button', { name: 'Apply to list it' }).click();
  await vendor.waitForURL(/\/vendor\/[0-9a-f-]{36}$/);
  const id = vendor.url().split('/').pop()!;
  await expect(vendor.getByText('4 steps before customers can order')).toBeVisible();

  await vendor.getByRole('link', { name: 'Add your menu' }).click();
  await vendor.getByPlaceholder('Category, e.g. Biryani').fill('Karahi');
  await vendor.getByRole('button', { name: 'Add category' }).click();
  await vendor.getByRole('link', { name: '+ Add an item to Karahi' }).click();
  await vendor.getByLabel('Name', { exact: true }).fill('Chicken Karahi (half)');
  await vendor.getByLabel('Price (Rs)').fill('1200');
  await vendor.getByRole('button', { name: 'Add item' }).click();
  await expect(vendor.getByRole('link', { name: 'Chicken Karahi (half)' })).toBeVisible();

  await vendor.goto(`/vendor/${id}/hours`);
  await vendor.getByRole('button', { name: '24 hours' }).first().click();
  await vendor.getByRole('button', { name: "Use Monday's hours every day" }).click();
  await vendor.getByRole('button', { name: 'Save opening hours' }).click();
  await expect(vendor.getByText('Saved. Customers see the new hours now.')).toBeVisible();

  await vendor.goto(`/vendor/${id}/zones`);
  await vendor.getByLabel('Name').fill('Nearby');
  await vendor.getByLabel('Within (km)').fill('3');
  await vendor.getByLabel('Delivery (Rs)').fill('99');
  await vendor.getByLabel('Minimum (Rs)').fill('0');
  await vendor.getByLabel('Delivery takes (min)').fill('35');
  await vendor.getByRole('button', { name: 'Add zone' }).click();
  // Saved once it's listed.
  await expect(vendor.getByText('Nearby · within 3 km')).toBeVisible();

  await vendor.goto(`/vendor/${id}`);
  await expect(vendor.getByText('1 step before customers can order')).toBeVisible();

  const admin = await phone({ person: await signInAdmin() });
  await admin.goto(`/admin/restaurants/${id}`);
  await admin.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Live', { exact: true })).toBeVisible();

  await vendor.reload();
  await expect(vendor.getByText('Taking orders')).toBeVisible();
  await expect(vendor.getByText(/before customers can order/)).toHaveCount(0);

  const customer = await phone({ at: near(at, 1000, -500) });
  await deliverHere(customer);
  await openFromListing(customer, { name });
  await expect(customer.getByText('Chicken Karahi (half)')).toBeVisible();
});

test('a rider applies, is approved, and goes on shift', async ({ phone }) => {
  const at = newSpot();
  const person = await signIn();
  const rider = await phone({ person, at });
  await rider.goto('/rider');
  await rider.getByLabel('Your name').fill('Bilal Ahmed');
  await rider.getByLabel('City').fill('Testpur');
  await rider.getByText('Motorbike').click();
  await rider.getByRole('button', { name: 'Apply to ride' }).click();
  await expect(rider.getByRole('heading', { name: 'Thanks for applying' })).toBeVisible();

  const admin = await phone({ person: await signInAdmin() });
  await admin.goto(`/admin/riders/${person.userId}`);
  await admin.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Approved', { exact: true })).toBeVisible();

  await rider.reload();
  await expect(rider.getByRole('heading', { name: 'Hi, Bilal' })).toBeVisible();
  await rider.getByRole('button', { name: 'Go online' }).click();
  await expect(rider.getByRole('button', { name: 'Go offline' })).toBeVisible();

  // Off again, so the next journey's orders aren't offered to this rider.
  await rider.getByRole('button', { name: 'Go offline' }).click();
  await expect(rider.getByRole('button', { name: 'Go online' })).toBeVisible();
});
