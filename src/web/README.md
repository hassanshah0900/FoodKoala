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
- **`/login`**: sign in or sign up with a mobile number and the 6-digit code texted to it (auth-service).

### Restaurant console (`/vendor`)

For owners: `/vendor` opens their restaurant (someone without one is told how to get listed), and another
restaurant they own is a switch away. Only its owner can open a restaurant's console.

- **`/vendor/{restaurantId}`**: the kitchen board, refreshed every 15 seconds. New orders count down the 10 minutes
  order-service gives to answer; the owner accepts with a prep time or rejects with a reason. Then "Food is ready"
  for the rider. Pausing new orders for 15 minutes to 2 hours, and taking them again.
- **`/vendor/{restaurantId}/history`**: past orders, with why any were rejected or cancelled.
- **`/vendor/{restaurantId}/menu`**: the menu as customers will see it: add, rename, reorder and delete categories;
  reorder items, and mark one sold out or back in stock in one click.
- **`/vendor/{restaurantId}/menu/new`** and **`/menu/items/{itemId}`**: a dish's name, price, description, photo
  link, category and choices (groups like "Size: pick 1" with what each option adds). Option ids are kept when an
  item is saved, so carts holding them stay valid.
- **`/vendor/{restaurantId}/hours`**: each weekday open at set times (up to 3, e.g. with a break; closing after
  midnight is fine), 24 hours or closed, with "use Monday's hours every day"; and special days such as Ramadan or
  Eid that replace the week's hours on their dates, or close the restaurant.

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
