# End-to-end tests

The main journeys through the whole stack, in a real browser (Playwright):

| Test               | Journey                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `order-to-door`    | A customer orders, the kitchen accepts and cooks, a rider picks up, they chat, the rider delivers, the customer rates                     |
| `onboarding`       | A restaurant applies, builds its menu, hours and zone, is approved, and customers find it; a rider applies, is approved and goes on shift |
| `order-exceptions` | The customer cancels before the kitchen accepts; the kitchen rejects with a reason the customer sees                                      |
| `scheduled-order`  | An order for later waits in the kitchen's Scheduled list and can't be accepted early                                                      |
| `chat-alert`       | A rider's unread message reaches the customer by SMS after a minute, and the bell leads back to the chat                                  |

## Running them

```sh
make e2e-up                 # the stack, with e2e/compose.yml on top
cd e2e && npm ci && npx playwright install chromium
npx playwright test         # or: make e2e
npx playwright test --headed order-to-door   # watch one
```

`e2e/compose.yml` swaps Twilio for `fake-sms`, which keeps every text in memory;
tests read login codes and alerts from it at `localhost:4010/messages?to=`.
It also makes `+923009999999` an admin and loosens the OTP limits.
`make up` puts the everyday stack back.

## How they're written

- Each test makes the people and places it needs (`support/world.ts`, through the
  API) and drives the journey itself through the browser. Fresh phone numbers
  each run, so tests don't depend on each other or on what's in the database.
- Every restaurant sits at its own random spot (`support/places.ts`), so a rider
  left online by another test is too far away to be offered its orders.
- Tests run one at a time (`workers: 1`) for the same reason.
- What arrives through Kafka (an order's status after a pickup, a new restaurant
  in search) shows after a moment: `reloadUntilVisible` waits for it.

## Demo data and a video tour

```sh
make e2e-up
cd e2e && npm ci && npx playwright install chromium
npm run seed   # restaurants, riders, a voucher and a customer with past orders
npm run tour   # records tour/out/foodkoala-tour.webm (and .mp4 with ffmpeg)
```

`seed/seed.ts` builds a demo around Gulberg, Lahore through the API, from what
`seed/catalogue.ts` lists: seven restaurants with menus, hours and zones, one
more waiting for approval, an approved rider on shift and one waiting, the
voucher `KOALA20`, and Ayesha, a customer with four delivered and rated orders.
It's safe to run again; what exists is left alone. Pick "Gulberg, Lahore" on
the landing page and sign in as:

| Who               | Number                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Customer (Ayesha) | `03001000001`                                                      |
| Rider (Bilal)     | `03003000001`                                                      |
| Admin             | `03009999999`                                                      |
| Restaurant owners | `03002000001` (Lahori Biryani House) to `03002000008` (Chai Khana) |

Login codes are at `localhost:4010/messages?to=+92…`.

`tour/tour.ts` plays one order from browsing to rating, as customer, kitchen
and rider in turn, then walks the partner and admin consoles, with captions.
Start from a fresh seed for the full story: its first run also approves the
waiting restaurant and rider. For an empty database, start the stack under its
own project name, e.g. `docker compose -p foodkoala-demo … up`, which gets its
own volumes.
