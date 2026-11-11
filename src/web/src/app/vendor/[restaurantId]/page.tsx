import { StatusBadge } from '@/components/console/StatusBadge';
import { AutoRefresh } from '@/components/orders/AutoRefresh';
import { SetupChecklist } from '@/components/vendor/SetupChecklist';
import { Ticket } from '@/components/vendor/Ticket';
import { TicketActions } from '@/components/vendor/TicketActions';
import { freshMenu } from '@/lib/api/menus';
import { restaurantOrders } from '@/lib/api/orders';
import { restaurantZones } from '@/lib/api/restaurants';
import type { ManagedRestaurant } from '@/lib/api/types';
import { clockTime } from '@/lib/format';
import { board, type Column, held, isHeld, PAUSES } from '@/lib/kitchen';
import { requireOwner } from '@/lib/owner';
import { setupSteps } from '@/lib/restaurant-form';
import { dayName } from '@/lib/schedule';
import { answerOrder, setPause } from '../actions';

const COLUMNS: { column: Column; title: string; empty: string }[] = [
  { column: 'placed', title: 'New', empty: 'New orders appear here.' },
  { column: 'accepted', title: 'Preparing', empty: 'Nothing on the stove.' },
  { column: 'ready', title: 'Ready for pickup', empty: 'Nothing waiting for a rider.' },
];

/** The kitchen board: new orders to answer, food being made, and food waiting for its rider. */
export default async function VendorOrders({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { token, restaurant } = await requireOwner(restaurantId);
  const live = await restaurantOrders(token, restaurant.id, ['placed', 'accepted', 'ready']);
  // Until it is live, the owner sees what is left to do.
  const steps =
    restaurant.status === 'approved'
      ? null
      : await Promise.all([freshMenu(token, restaurant.id), restaurantZones(token, restaurant.id)]).then(
          ([menu, zones]) =>
            setupSteps({
              status: restaurant.status,
              hasHours: Object.values(restaurant.hours.weekly).some((r) => r && r.length > 0),
              zones: zones.length,
              items: menu.categories.reduce((n, c) => n + c.items.length, 0),
            }),
        );
  const now = Date.now();
  const columns = board(live.items.filter((o) => !isHeld(o, now)));
  const later = held(live.items, now);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={15} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">{restaurant.name}</h1>
          <p className="text-sm text-muted">
            Orders · {restaurant.address.area}, {restaurant.address.city}
          </p>
        </div>
        {restaurant.status === 'approved' && <PauseControl restaurant={restaurant} />}
      </div>
      <StatusNotice restaurant={restaurant} />
      {steps && <SetupChecklist base={`/vendor/${restaurant.id}`} steps={steps} />}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        {COLUMNS.map(({ column, title, empty }) => (
          <section key={column} className="space-y-3">
            <h2 className="flex items-center gap-2 font-bold">
              {title}
              <span className="rounded-full bg-white px-2 text-sm text-muted">{columns[column].length}</span>
            </h2>
            {columns[column].length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-line px-4 py-10 text-center text-sm text-muted">
                {empty}
              </p>
            ) : (
              columns[column].map((o) => (
                <Ticket key={o.id} order={o} now={now}>
                  <TicketActions action={answerOrder.bind(null, restaurant.id, o.id)} status={column} />
                </Ticket>
              ))
            )}
          </section>
        ))}
      </div>
      {later.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold">
            Scheduled
            <span className="rounded-full bg-white px-2 text-sm text-muted">{later.length}</span>
          </h2>
          <p className="text-sm text-muted">
            Each one moves to New 45 minutes before it is due, and you accept it then.
          </p>
          <div className="grid items-start gap-6 lg:grid-cols-3">
            {later.map((o) => (
              <Ticket key={o.id} order={o} now={now}>
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                  To accept from {dayName(o.releaseAt, now)}, {clockTime(o.releaseAt)}
                </p>
              </Ticket>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Whether customers can order now, and a quick pause for when the kitchen is full. */
function PauseControl({ restaurant }: { restaurant: ManagedRestaurant }) {
  const action = setPause.bind(null, restaurant.id);
  if (restaurant.pausedUntil) {
    return (
      <form action={action} className="flex items-center gap-3">
        <StatusBadge label={`Paused until ${clockTime(restaurant.pausedUntil)}`} tone="bad" />
        <button
          type="submit"
          name="minutes"
          value="0"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
        >
          Take orders again
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <StatusBadge
        label={restaurant.openNow ? 'Taking orders' : 'Closed now'}
        tone={restaurant.openNow ? 'good' : 'neutral'}
      />
      <span className="text-sm text-muted">Busy? Pause for</span>
      {PAUSES.map((p) => (
        <button
          key={p.minutes}
          type="submit"
          name="minutes"
          value={p.minutes}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-brand-50"
        >
          {p.label}
        </button>
      ))}
    </form>
  );
}

/** Why a restaurant that isn't live can't get orders yet. */
function StatusNotice({ restaurant }: { restaurant: ManagedRestaurant }) {
  const text = {
    approved: null,
    pending: 'FoodKoala is reviewing your restaurant. Customers will see it once it is approved.',
    rejected: `Your application wasn't approved: ${restaurant.statusReason}. Fix it, then ask for review again under Restaurant details.`,
    suspended: `Your restaurant is suspended: ${restaurant.statusReason}. Customers can't order until FoodKoala reinstates it.`,
  }[restaurant.status];
  if (!text) return null;
  return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{text}</p>;
}
