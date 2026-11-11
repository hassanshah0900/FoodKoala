# web

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · **Port:** 3000

FoodKoala's web app. This first part is browsing as a guest: choose where to deliver, find restaurants and read
their menus. Signing in, the cart, checkout and order tracking come next, then the `/vendor`, `/rider` and
`/admin` sections ([docs/architecture.md](../../docs/architecture.md)).

## Pages

- **`/`**: choose a delivery area (or "Locate me" with the browser's location) and a city. The choice is kept in
  the `fk_location` cookie, so pages rendered on the server search near it.
- **`/restaurants`**: restaurants delivering there (search-service), with search, cuisine chips, sort order and
  pages. Filters live in the URL as plain links, so they work without JavaScript and can be shared.
- **`/restaurant/{id}`**: the restaurant (restaurant-service), its delivery terms to the chosen area and its menu
  (menu-service), with sticky category tabs that follow the scroll.

- **Cart.** Tapping a menu item opens its sheet: choices (one-choice groups as radio buttons, others as boxes up
  to their limit, required ones marked until met), special instructions and a quantity, with the price on the
  button. The cart sits beside the menu (on phones, a "View your cart" bar opens `/cart`), with steppers that
  work without JavaScript, the delivery fee and how much is missing for the minimum order. A cart holds one
  restaurant: adding from another asks before starting a new cart. Guests are sent to sign in first.
- **`/checkout`**: the delivery address (pick a saved one, or add one at the chosen area), a voucher, a tip for
  the rider and cash on delivery, with the order on the right. Choices live in the URL, so the server prices them
  as order-service will; the order is placed with an Idempotency-Key fixed when the page rendered, so a double
  click can't order twice.
- **`/orders/{id}`**: where the order is, a row of steps and the arrival time, refreshed every 15 seconds until
  it is delivered, rejected or cancelled; then what was ordered, the money and the address.
- **`/orders`**: the customer's orders, newest first: follow one, see it, order it again (the cart is filled at
  today's prices, asking before replacing another restaurant's cart, and saying what couldn't be added), and rate
  it. On a delivered order's page the customer rates the food, and the rider when a rider brought it, within 7 days.
- **`/account`**: the customer's name, email and the language texts come in; saved addresses (make one the
  default, delete, add one at the chosen area with the same fields as checkout); and favourite restaurants, kept
  with the heart on each restaurant's page.
- **`/login`**: sign in or sign up with a mobile number and the 6-digit code texted to it (auth-service).

### Restaurant console (`/vendor`)

For owners: `/vendor` opens their restaurant (someone without one is sent to list it), and another restaurant
they own is a switch away. Only its owner can open a restaurant's console.

- **`/vendor/new`**: list a restaurant: name, phone (mobile or landline), cuisines, address (quick-filled from an
  area), its place on the map ("lat, lng", or the owner's own location) and photo links. It starts pending, and its
  orders page lists what is left: menu, hours, zones, then FoodKoala's approval.
- **`/vendor/{restaurantId}/details`**: the same listing, to change; a rejected restaurant asks for review again.

- **`/vendor/{restaurantId}`**: the kitchen board, refreshed every 15 seconds. New orders count down the 10 minutes
  order-service gives to answer; the owner accepts with a prep time or rejects with a reason. Then "Food is ready"
  for the rider. Pausing new orders for 15 minutes to 2 hours, and taking them again.
- **`/vendor/{restaurantId}/history`**: past orders, with why any were rejected or cancelled.
- **`/vendor/{restaurantId}/reports`**: sales for the last 7, 30 or 90 days (Pakistan days, today included): sales,
  delivered orders, average order and prep time, rejected or cancelled orders and voucher discounts, each against
  the stretch just before; each day's sales as columns (hover a day, or open it as a table); and the best sellers.
- **`/vendor/{restaurantId}/menu`**: the menu as customers will see it: add, rename, reorder and delete categories;
  reorder items, and mark one sold out or back in stock in one click.
- **`/vendor/{restaurantId}/menu/new`** and **`/menu/items/{itemId}`**: a dish's name, price, description, photo
  link, category and choices (groups like "Size: pick 1" with what each option adds). Option ids are kept when an
  item is saved, so carts holding them stay valid.
- **`/vendor/{restaurantId}/hours`**: each weekday open at set times (up to 3, e.g. with a break; closing after
  midnight is fine), 24 hours or closed, with "use Monday's hours every day"; and special days such as Ramadan or
  Eid that replace the week's hours on their dates, or close the restaurant.
- **`/vendor/{restaurantId}/zones`**: where it delivers: zones as rings "within N km" of the restaurant, each with
  its delivery fee, minimum order and time, drawn to scale. Where zones overlap the customer gets the cheapest, so a
  free nearby ring inside a wider paid one works. A zone drawn some other way keeps its shape unless given a distance.

### Rider app (`/rider`)

Made for a phone: one column, big buttons. Someone who isn't a rider applies (name, city, vehicle) and waits for
FoodKoala's approval. An approved rider goes online with the phone's location, which is then sent every 20
seconds (orders go to the nearest free rider with a fresh position; the customer follows the one carrying theirs).
The delivery in hand shows where to go now, with directions in the maps app and the customer's number, what cash
to collect, and one button for the next step: "I have the food", then "Delivered". Before pickup the rider can
hand it back. Going offline isn't possible while carrying an order.

**`/rider/earnings`**: what the rider earned today, in 7 or 30 days (fees, tips, deliveries, cash collected); their
balance with FoodKoala (cash they hold, earnings not paid, who owes whom); and the settlements recorded.

### Admin console (`/admin`)

Only for users with the `admin` role (see `ADMIN_PHONES` in auth-service); guests are sent to log in and anyone
else gets a 404. It has its own frame, with the sections down the side.

- **`/admin`**: what is waiting: deliveries no rider has taken, and the oldest restaurant and rider applications.
- **`/admin/deliveries`**: deliveries by where they are, "looking for a rider" first; each links to its order.
- **`/admin/orders/{id}`**: one order across the services: what was ordered and the money, its timeline (who did
  what, and why), its delivery and rider, and its payment. An admin can reject or cancel it with a reason, or mark
  the pickup or drop-off for a rider who can't. `/admin/orders` finds one by its id.
- **`/admin/payments`**: payments to collect, collected and cancelled.
- **`/admin/restaurants`**: restaurants by status (waiting for review, live, suspended, rejected).
- **`/admin/restaurants/{id}`**: the details, opening hours and delivery zones an admin checks, what still stops
  an approval, and the decision: approve, reject or suspend (with a reason the owner sees), reinstate.
- **`/admin/riders`**: riders by status (waiting for approval, approved, suspended).
- **`/admin/riders/{userId}`**: approve, suspend or reinstate; the last 7 days' deliveries, fees, tips and cash;
  the balance (cash in hand, unpaid earnings, who owes whom); and settling it: cash handed in, a payout, or
  earnings kept from the cash, filled in with the entry that clears the most.
- **`/admin/vouchers`**: every voucher with its terms, uses and dates, and whether it is live, scheduled, paused,
  ended or used up; pause or resume one, or change its end, total uses and description.
- **`/admin/vouchers/new`**: a percent (optionally capped) or rupee discount, a minimum order, one restaurant or
  any, first orders only, total and per-customer uses, and when it runs (Pakistan time).

## Sessions

The access token (15 minutes) and the single-use refresh token are kept in httpOnly cookies, so scripts in the
page never see them. `src/proxy.ts` runs before each page and server action: when the access token is missing
or about to expire it trades the refresh token for a new pair, setting the cookies on both the request (so that
render already uses them) and the response. A refresh token that auth-service refuses signs the user out.
`lib/session.ts` gives pages `currentUser()`, `accessToken()`, `requireUser()` and `requireAdmin()`.

**Live tracking.** The order page's map listens to `/orders/<id>/live`, a route that holds the WebSocket to
tracking-service on the server and passes each update on as a Server-Sent Event. The token goes no further than
the Next.js server, so it stays out of the page's scripts. The map is Leaflet with OpenStreetMap tiles, loaded only in the browser.

**Chat.** The order page and the rider app show the chat between the customer and the rider (chat-service).
The browser talks only to the app's routes under `/chat/<orderId>/`: `live` relays the chat's WebSocket as
Server-Sent Events, the same way tracking does (`lib/socket-relay.ts`), and `messages`, `photos`, `photos/<id>`
and `read` pass on to chat-service with the token from the cookie. Photos are shrunk in the browser to at most
1600 px (JPEG) before they are sent, and are only ever served through the app to the people in the chat.

**Address pins.** New addresses get a map pin the customer drags to their door, a "Use my location" button, and a
search for a street or block. Searches go through `/places`, which asks a Nominatim geocoder: the public
OpenStreetMap one by default, or the one `GEOCODER_URL` points at. The public one allows about a search a second,
so production should run its own. Results are cached for a day.

## Layout

| Folder            | What it holds                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/app/`        | Routes: each page loads its data and arranges components. `(shop)/` is the customer's side, `admin/` the console. |
| `src/components/` | Presentation only: they receive data as props and fetch nothing.                                                  |
| `src/lib/api/`    | One file per service the app calls through api-gateway, typed after `contracts/openapi`. Server only.             |
| `src/lib/`        | Pure helpers (money, the location cookie, listing filters, menu prices), each with a `.spec.ts`.                  |

**Design.** The palette is in `src/app/globals.css` as Tailwind theme tokens: `brand-600` (`#7a1fb3`) is the
FoodKoala purple of buttons, links and the logo; lighter shades tint backgrounds, darker ones are hover states.

## Run

```bash
npm install
API_URL=http://localhost:8080 npm run dev   # http://localhost:3000, with api-gateway and the services running
```

## Check

```bash
npm run typecheck && npm test && npm run lint && npm run format:check && npm run build
```
