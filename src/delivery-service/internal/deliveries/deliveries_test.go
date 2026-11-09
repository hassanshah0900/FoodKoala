package deliveries_test

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/deliveries"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/outbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/testdb"
)

// Gulshan-e-Iqbal, Karachi: the restaurant, and points about 1 km, 3 km and 20 km away.
var (
	restaurant = [2]float64{24.9204, 67.0932}
	near       = [2]float64{24.9290, 67.0980}
	farther    = [2]float64{24.9450, 67.1100}
	tooFar     = [2]float64{25.1000, 67.1000}
)

type fixture struct {
	t   *testing.T
	ctx context.Context
	db  *pgxpool.Pool
	svc deliveries.Service
}

func setup(t *testing.T) fixture {
	pool := testdb.Open(t)
	return fixture{t: t, ctx: context.Background(), db: pool,
		svc: deliveries.Service{DB: pool, MaxPickupMeters: 5000, LocationFreshFor: 5 * time.Minute}}
}

func (f fixture) event(typ string, data map[string]any) []byte {
	b, _ := json.Marshal(map[string]any{"id": outbox.NewID(), "type": typ, "version": 1, "data": data})
	return b
}

func (f fixture) apply(raw []byte) {
	f.t.Helper()
	if err := f.svc.Apply(f.ctx, raw); err != nil {
		f.t.Fatal(err)
	}
}

func (f fixture) placed(orderID, customerID string) []byte {
	return f.event("order.placed", map[string]any{
		"orderId": orderID, "customerId": customerID, "customerPhone": "+923001112233",
		"restaurantId": outbox.NewID(), "restaurantName": "Karachi Broast",
		"restaurantLocation": map[string]any{"lat": restaurant[0], "lng": restaurant[1]},
		"totals":             map[string]any{"subtotalPaisa": 90000, "deliveryFeePaisa": 9900, "totalPaisa": 99900},
		"paymentMethod":      "cod",
		"deliveryAddress":    map[string]any{"lat": 24.93, "lng": 67.1, "text": "House 7, Block 10, Gulshan-e-Iqbal, Karachi", "landmark": nil},
	})
}

func (f fixture) status(orderID, to, by string, at time.Time) []byte {
	return f.event("order.status_changed", map[string]any{"orderId": orderID, "to": to, "by": by, "at": at.Format(time.RFC3339Nano)})
}

// order places an order and has the restaurant accept it: a delivery searching for a rider.
func (f fixture) order() (orderID, customerID string) {
	orderID, customerID = outbox.NewID(), outbox.NewID()
	f.apply(f.placed(orderID, customerID))
	f.apply(f.status(orderID, "accepted", "restaurant", time.Now()))
	return orderID, customerID
}

// rider adds an approved rider at a place; online and freshly located unless told otherwise.
func (f fixture) rider(at [2]float64, opts ...string) identity.Identity {
	id := outbox.NewID()
	status, online, locatedAt := "approved", true, time.Now()
	for _, o := range opts {
		switch o {
		case "pending":
			status = "pending"
		case "offline":
			online = false
		case "stale":
			locatedAt = time.Now().Add(-time.Hour)
		}
	}
	if _, err := f.db.Exec(f.ctx, `INSERT INTO delivery.riders (user_id, name, phone, vehicle, city, status, online, lat, lng, located_at)
		VALUES ($1, 'Ali', '+923004445566', 'motorbike', 'Karachi', $2, $3, $4, $5, $6)`, id, status, online, at[0], at[1], locatedAt); err != nil {
		f.t.Fatal(err)
	}
	return identity.Identity{UserID: id, Phone: "+923004445566"}
}

func (f fixture) delivery(orderID string) deliveries.Delivery {
	f.t.Helper()
	d, err := f.svc.ForOrder(f.ctx, identity.Identity{Roles: []string{"admin"}}, orderID)
	if err != nil {
		f.t.Fatal(err)
	}
	return d
}

func (f fixture) assign() int {
	f.t.Helper()
	n, err := f.svc.AssignOnce(f.ctx)
	if err != nil {
		f.t.Fatal(err)
	}
	return n
}

func (f fixture) topics(orderID string) []string {
	rows, _ := f.db.Query(f.ctx, `SELECT topic FROM delivery.outbox WHERE key = $1 ORDER BY id`, orderID)
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		_ = rows.Scan(&s)
		out = append(out, s)
	}
	return out
}

func TestOrderEventsDriveTheDelivery(t *testing.T) {
	f := setup(t)
	orderID, customerID := outbox.NewID(), outbox.NewID()
	placed := f.placed(orderID, customerID)
	f.apply(placed)
	f.apply(placed) // a redelivered event changes nothing
	d := f.delivery(orderID)
	if d.Status != "waiting" || d.CashToCollectPaisa != 99900 || d.DeliveryFeePaisa != 9900 || d.Restaurant.Location.Lat != restaurant[0] {
		t.Fatalf("unexpected delivery: %+v", d)
	}
	f.apply(f.status(orderID, "accepted", "restaurant", time.Now()))
	f.apply(f.status(orderID, "ready", "restaurant", time.Now()))
	if d := f.delivery(orderID); d.Status != "searching" || d.FoodReadyAt == nil {
		t.Fatalf("expected searching with the food ready: %+v", d)
	}
}

func TestStatusBeforeItsOrderWaitsUnlessItIsOld(t *testing.T) {
	f := setup(t)
	orderID := outbox.NewID()
	early := f.status(orderID, "accepted", "restaurant", time.Now())
	if err := f.svc.Apply(f.ctx, early); !errors.Is(err, deliveries.ErrNotYet) {
		t.Fatalf("expected ErrNotYet, got %v", err)
	}
	f.apply(f.placed(orderID, outbox.NewID()))
	f.apply(early) // the retry is not mistaken for a duplicate
	if d := f.delivery(orderID); d.Status != "searching" {
		t.Fatalf("expected searching, got %s", d.Status)
	}
	f.apply(f.status(outbox.NewID(), "accepted", "restaurant", time.Now().Add(-time.Hour)))
}

func TestMalformedEventsAreReported(t *testing.T) {
	f := setup(t)
	for _, raw := range [][]byte{[]byte("not json"), f.event("order.eaten", map[string]any{}),
		f.event("order.placed", map[string]any{"orderId": outbox.NewID()})} {
		if err := f.svc.Apply(f.ctx, raw); !errors.Is(err, deliveries.ErrMalformed) {
			t.Fatalf("expected ErrMalformed, got %v", err)
		}
	}
}

func TestAssignsTheNearestFreeRiderInRange(t *testing.T) {
	f := setup(t)
	f.rider(near, "offline")
	f.rider(near, "pending")
	f.rider(near, "stale")
	f.rider(tooFar)
	second := f.rider(farther)
	best := f.rider(near)

	first, _ := f.order()
	if n := f.assign(); n != 1 {
		t.Fatalf("assigned %d", n)
	}
	if d := f.delivery(first); d.Status != "assigned" || d.Rider == nil || d.Rider.UserID != best.UserID {
		t.Fatalf("expected the nearest rider: %+v", d.Rider)
	}
	// The best rider is busy now, so the next order goes to the one farther away.
	next, _ := f.order()
	f.assign()
	if d := f.delivery(next); d.Rider == nil || d.Rider.UserID != second.UserID {
		t.Fatalf("expected the second rider: %+v", d.Rider)
	}
	// Nobody else qualifies.
	last, _ := f.order()
	if n := f.assign(); n != 0 || f.delivery(last).Status != "searching" {
		t.Fatal("expected the last order to keep searching")
	}
	if got := f.topics(first); len(got) != 1 || got[0] != "delivery.assigned" {
		t.Fatalf("expected delivery.assigned, got %v", got)
	}
	var data map[string]any
	if err := f.db.QueryRow(f.ctx, `SELECT payload->'data' FROM delivery.outbox WHERE key = $1`, first).Scan(&data); err != nil {
		t.Fatal(err)
	}
	if data["riderId"] != best.UserID || data["customerPhone"] != "+923001112233" || data["restaurantName"] != "Karachi Broast" || data["customerId"] == "" {
		t.Fatalf("delivery.assigned data: %v", data)
	}
}

func TestRiderPicksUpAndDropsOff(t *testing.T) {
	f := setup(t)
	me := f.rider(near)
	other := f.rider(farther)
	orderID, _ := f.order()
	f.assign()
	d := f.delivery(orderID)

	if _, err := f.svc.DropOff(f.ctx, me, d.ID); err == nil {
		t.Fatal("dropped off before picking up")
	}
	if _, err := f.svc.PickUp(f.ctx, other, d.ID); err == nil {
		t.Fatal("another rider picked it up")
	}
	if cur, err := f.svc.Current(f.ctx, me); err != nil || cur.ID != d.ID {
		t.Fatalf("current: %v %+v", err, cur)
	}
	if got, err := f.svc.PickUp(f.ctx, me, d.ID); err != nil || got.Status != "picked_up" || got.PickedUpAt == nil {
		t.Fatalf("pickup: %v %+v", err, got)
	}
	if err := f.svc.Decline(f.ctx, me, d.ID); err == nil {
		t.Fatal("declined after pickup")
	}
	if got, err := f.svc.DropOff(f.ctx, me, d.ID); err != nil || got.Status != "delivered" {
		t.Fatalf("dropoff: %v %+v", err, got)
	}
	if _, err := f.svc.Current(f.ctx, me); err == nil {
		t.Fatal("still carrying an order")
	}
	want := []string{"delivery.assigned", "delivery.picked_up", "delivery.delivered"}
	if got := f.topics(orderID); len(got) != 3 || got[1] != want[1] || got[2] != want[2] {
		t.Fatalf("events %v", got)
	}
	// order-service echoes the rider's steps back; they change nothing.
	f.apply(f.status(orderID, "picked_up", "rider", time.Now()))
	f.apply(f.status(orderID, "cancelled", "admin", time.Now()))
	if f.delivery(orderID).Status != "delivered" {
		t.Fatal("a delivered order changed")
	}
}

func TestDeclinedDeliveriesGoToSomeoneElse(t *testing.T) {
	f := setup(t)
	first := f.rider(near)
	second := f.rider(farther)
	orderID, _ := f.order()
	f.assign()
	d := f.delivery(orderID)
	if err := f.svc.Decline(f.ctx, first, d.ID); err != nil {
		t.Fatal(err)
	}
	f.assign()
	if d := f.delivery(orderID); d.Rider == nil || d.Rider.UserID != second.UserID {
		t.Fatalf("expected the second rider: %+v", d.Rider)
	}
	if err := f.svc.Decline(f.ctx, second, d.ID); err != nil {
		t.Fatal(err)
	}
	if n := f.assign(); n != 0 {
		t.Fatal("offered again to a rider who declined")
	}
}

func TestCancellingFreesTheRider(t *testing.T) {
	f := setup(t)
	me := f.rider(near)
	orderID, _ := f.order()
	f.assign()
	f.apply(f.status(orderID, "cancelled", "admin", time.Now()))
	d := f.delivery(orderID)
	if d.Status != "cancelled" {
		t.Fatalf("expected cancelled, got %s", d.Status)
	}
	if _, err := f.svc.PickUp(f.ctx, me, d.ID); err == nil || err.Error() != "This order was cancelled" {
		t.Fatalf("expected 'cancelled', got %v", err)
	}
	next, _ := f.order()
	f.assign()
	if d := f.delivery(next); d.Rider == nil || d.Rider.UserID != me.UserID {
		t.Fatal("the rider was not free again")
	}
}

func TestOrdersHandledByHandStopTheSearch(t *testing.T) {
	f := setup(t)
	orderID, _ := f.order()
	f.apply(f.status(orderID, "picked_up", "admin", time.Now()))
	if d := f.delivery(orderID); d.Status != "cancelled" {
		t.Fatalf("expected cancelled, got %s", d.Status)
	}
}

func TestConcurrentAssignersNeverDoubleBook(t *testing.T) {
	f := setup(t)
	f.rider(near)
	for range 4 {
		f.order()
	}
	var wg sync.WaitGroup
	counts := make([]int, 4)
	for i := range counts {
		wg.Add(1)
		go func() { defer wg.Done(); counts[i], _ = f.svc.AssignOnce(f.ctx) }()
	}
	wg.Wait()
	total := counts[0] + counts[1] + counts[2] + counts[3]
	var assigned int
	_ = f.db.QueryRow(f.ctx, `SELECT count(*) FROM delivery.deliveries WHERE status = 'assigned'`).Scan(&assigned)
	if total != 1 || assigned != 1 {
		t.Fatalf("one rider got %d orders (reported %d)", assigned, total)
	}
}

func TestOnlyTheCustomerRiderAndAdminsSeeADelivery(t *testing.T) {
	f := setup(t)
	me := f.rider(near)
	orderID, customerID := f.order()
	f.assign()
	for _, who := range []identity.Identity{{UserID: customerID}, me, {UserID: outbox.NewID(), Roles: []string{"admin"}}} {
		if _, err := f.svc.ForOrder(f.ctx, who, orderID); err != nil {
			t.Fatalf("%+v cannot see it: %v", who, err)
		}
	}
	if _, err := f.svc.ForOrder(f.ctx, identity.Identity{UserID: outbox.NewID()}, orderID); err == nil {
		t.Fatal("a stranger saw the delivery")
	}
}
