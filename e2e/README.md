# End-to-end tests

The main journeys through the whole stack, in a real browser (Playwright):

| Test | Journey |
| --- | --- |
| `order-to-door` | A customer orders, the kitchen accepts and cooks, a rider picks up, they chat, the rider delivers, the customer rates |
| `onboarding` | A restaurant applies, builds its menu, hours and zone, is approved, and customers find it; a rider applies, is approved and goes on shift |
| `order-exceptions` | The customer cancels before the kitchen accepts; the kitchen rejects with a reason the customer sees |
| `scheduled-order` | An order for later waits in the kitchen's Scheduled list and can't be accepted early |
| `chat-alert` | A rider's unread message reaches the customer by SMS after a minute, and the bell leads back to the chat |

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
