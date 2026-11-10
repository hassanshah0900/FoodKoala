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

## Layout

| Folder            | What it holds                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `src/app/`        | Routes. Each page loads its data on the server and arranges components. `actions.ts` saves the location. |
| `src/components/` | Presentation only: they receive data as props and fetch nothing.                                         |
| `src/lib/api/`    | One file per service the app calls through api-gateway, typed after `contracts/openapi`. Server only.    |
| `src/lib/`        | Pure helpers (money, the location cookie, listing filters, menu prices), each with a `.spec.ts`.         |

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
