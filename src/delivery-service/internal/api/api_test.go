package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/api"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/deliveries"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/earnings"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/outbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/riders"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/testdb"
)

type client struct {
	t *testing.T
	h http.Handler
}

type user map[string]string

func newUser(roles string) user {
	return user{"X-User-Id": outbox.NewID(), "X-User-Phone": "+923001234567", "X-User-Roles": roles}
}

func (c client) do(method, path string, who user, body any) (int, map[string]any) {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	for k, v := range who {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func (c client) expect(want int, method, path string, who user, body any) map[string]any {
	c.t.Helper()
	got, out := c.do(method, path, who, body)
	if got != want {
		c.t.Fatalf("%s %s: got %d, want %d: %v", method, path, got, want, out)
	}
	return out
}

func setup(t *testing.T) client {
	pool := testdb.Open(t)
	return client{t: t, h: api.New(api.Deps{
		DB:         pool,
		Riders:     riders.Service{DB: pool},
		Deliveries: deliveries.Service{DB: pool, MaxPickupMeters: 5000, LocationFreshFor: 5 * time.Minute},
	})}
}

var karachi = map[string]float64{"lat": 24.92, "lng": 67.09}

func TestHealth(t *testing.T) {
	c := setup(t)
	c.expect(200, "GET", "/healthz", nil, nil)
	c.expect(200, "GET", "/readyz", nil, nil)
}

func TestRiderSignsUpGetsApprovedAndWorksAShift(t *testing.T) {
	c := setup(t)
	me := newUser("customer")
	admin := newUser("customer,admin")

	c.expect(401, "POST", "/riders", nil, map[string]string{"name": "Ali", "vehicle": "motorbike", "city": "Karachi"})
	out := c.expect(400, "POST", "/riders", me, map[string]string{"name": "A", "vehicle": "rickshaw", "city": "Karachi"})
	if out["message"] != "name must be 2 to 80 characters; vehicle must be motorbike, bicycle or car" {
		t.Fatalf("message: %v", out["message"])
	}
	c.expect(400, "POST", "/riders", me, map[string]any{"name": "Ali", "vehicle": "motorbike", "city": "Karachi", "pay": 1})
	c.expect(404, "GET", "/riders/me", me, nil)
	rider := c.expect(201, "POST", "/riders", me, map[string]string{"name": " Ali Raza ", "vehicle": "motorbike", "city": "Karachi"})
	if rider["status"] != "pending" || rider["name"] != "Ali Raza" || rider["phone"] != "+923001234567" || rider["online"] != false {
		t.Fatalf("rider: %v", rider)
	}
	c.expect(409, "POST", "/riders", me, map[string]string{"name": "Ali", "vehicle": "car", "city": "Karachi"})

	out = c.expect(403, "POST", "/riders/me/online", me, map[string]any{"location": karachi})
	if out["message"] != "Your rider account is pending" {
		t.Fatalf("message: %v", out["message"])
	}
	c.expect(403, "GET", "/riders", me, nil)
	pending := c.expect(200, "GET", "/riders?status=pending", admin, nil)
	if items := pending["items"].([]any); len(items) != 1 {
		t.Fatalf("pending: %v", pending)
	}
	c.expect(400, "GET", "/riders?status=flying", admin, nil)
	c.expect(403, "GET", "/riders/"+me["X-User-Id"], me, nil)
	c.expect(404, "GET", "/riders/"+outbox.NewID(), admin, nil)
	c.expect(400, "GET", "/riders/not-an-id", admin, nil)
	if got := c.expect(200, "GET", "/riders/"+me["X-User-Id"], admin, nil); got["name"] != "Ali Raza" {
		t.Fatalf("rider for admin: %v", got)
	}
	c.expect(404, "POST", "/riders/"+outbox.NewID()+"/status", admin, map[string]string{"status": "approved"})
	c.expect(200, "POST", "/riders/"+me["X-User-Id"]+"/status", admin, map[string]string{"status": "approved"})

	c.expect(409, "PUT", "/riders/me/location", me, karachi)
	c.expect(400, "POST", "/riders/me/online", me, map[string]any{"location": map[string]float64{"lat": 51.5, "lng": -0.1}})
	online := c.expect(200, "POST", "/riders/me/online", me, map[string]any{"location": karachi})
	if online["online"] != true || online["location"].(map[string]any)["lat"] != 24.92 {
		t.Fatalf("online: %v", online)
	}
	c.expect(204, "PUT", "/riders/me/location", me, map[string]float64{"lat": 24.93, "lng": 67.1})
	c.expect(404, "GET", "/riders/me/delivery", me, nil)
	if offline := c.expect(200, "POST", "/riders/me/offline", me, nil); offline["online"] != false {
		t.Fatalf("offline: %v", offline)
	}

	suspended := c.expect(200, "POST", "/riders/"+me["X-User-Id"]+"/status", admin, map[string]string{"status": "suspended"})
	if suspended["status"] != "suspended" {
		t.Fatalf("suspended: %v", suspended)
	}
	c.expect(403, "POST", "/riders/me/online", me, map[string]any{"location": karachi})
}

func TestDeliveryRoutesCheckIdsAndCallers(t *testing.T) {
	c := setup(t)
	me := newUser("customer")
	admin := newUser("customer,admin")
	c.expect(400, "POST", "/deliveries/not-an-id/pickup", me, nil)
	c.expect(404, "POST", "/deliveries/"+outbox.NewID()+"/pickup", me, nil)
	c.expect(404, "POST", "/deliveries/"+outbox.NewID()+"/decline", me, nil)
	c.expect(404, "GET", "/deliveries/orders/"+outbox.NewID(), me, nil)
	c.expect(403, "GET", "/deliveries", me, nil)
	list := c.expect(200, "GET", "/deliveries?status=searching&limit=5", admin, nil)
	if list["limit"] != float64(5) || list["hasMore"] != false {
		t.Fatalf("list: %v", list)
	}
	c.expect(400, "GET", "/deliveries?limit=500", admin, nil)
}

type sent struct {
	topic, key string
	data       map[string]any
}

type recorder struct{ events []sent }

func (r *recorder) Send(_ context.Context, topic, key string, _ time.Time, data any) {
	r.events = append(r.events, sent{topic, key, data.(map[string]any)})
}

func TestLocationOfARiderCarryingAnOrderIsPublished(t *testing.T) {
	pool := testdb.Open(t)
	rec := &recorder{}
	c := client{t: t, h: api.New(api.Deps{
		DB:         pool,
		Riders:     riders.Service{DB: pool, Locations: rec},
		Deliveries: deliveries.Service{DB: pool, MaxPickupMeters: 5000, LocationFreshFor: 5 * time.Minute},
	})}
	me := newUser("customer")
	admin := newUser("customer,admin")
	c.expect(201, "POST", "/riders", me, map[string]string{"name": "Ali", "vehicle": "motorbike", "city": "Karachi"})
	c.expect(200, "POST", "/riders/"+me["X-User-Id"]+"/status", admin, map[string]string{"status": "approved"})
	c.expect(200, "POST", "/riders/me/online", me, map[string]any{"location": karachi})

	c.expect(204, "PUT", "/riders/me/location", me, karachi)
	if len(rec.events) != 0 {
		t.Fatalf("published without an order: %v", rec.events)
	}

	deliveryID, orderID := outbox.NewID(), outbox.NewID()
	if _, err := pool.Exec(context.Background(), `INSERT INTO delivery.deliveries
		(id, order_id, customer_id, customer_phone, restaurant_id, restaurant_name, pickup_lat, pickup_lng,
		 dropoff_lat, dropoff_lng, dropoff_text, cash_to_collect_paisa, delivery_fee_paisa, status, rider_id, assigned_at)
		VALUES ($1, $2, $3, '+923000000000', $4, 'Kolachi', 24.9, 67.1, 24.95, 67.05, 'Block 5', 0, 9900, 'assigned', $5, now())`,
		deliveryID, orderID, outbox.NewID(), outbox.NewID(), me["X-User-Id"]); err != nil {
		t.Fatal(err)
	}
	c.expect(204, "PUT", "/riders/me/location", me, map[string]float64{"lat": 24.93, "lng": 67.1})
	if len(rec.events) != 1 {
		t.Fatalf("events: %v", rec.events)
	}
	e := rec.events[0]
	if e.topic != "rider.location" || e.key != orderID || e.data["deliveryId"] != deliveryID || e.data["riderId"] != me["X-User-Id"] ||
		e.data["location"] != (riders.Location{Lat: 24.93, Lng: 67.1}) {
		t.Fatalf("event: %+v", e)
	}
}

// delivered records a delivery the rider dropped off at `at`.
func delivered(t *testing.T, pool *pgxpool.Pool, riderID string, feePaisa, tipPaisa, cashPaisa int, at time.Time) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `INSERT INTO delivery.deliveries
		(id, order_id, customer_id, customer_phone, restaurant_id, restaurant_name, pickup_lat, pickup_lng,
		 dropoff_lat, dropoff_lng, dropoff_text, cash_to_collect_paisa, delivery_fee_paisa, tip_paisa, status, rider_id,
		 assigned_at, picked_up_at, delivered_at)
		VALUES ($1, $2, $3, '+923000000000', $4, 'Kolachi', 24.9, 67.1, 24.95, 67.05, 'Block 5', $5, $6, $7, 'delivered', $8, $9, $9, $9)`,
		outbox.NewID(), outbox.NewID(), outbox.NewID(), outbox.NewID(), cashPaisa, feePaisa, tipPaisa, riderID, at); err != nil {
		t.Fatal(err)
	}
}

func TestRidersSeeTheirEarningsAndAdminsSettleThem(t *testing.T) {
	pool := testdb.Open(t)
	c := client{t: t, h: api.New(api.Deps{DB: pool, Riders: riders.Service{DB: pool}, Earnings: earnings.Service{DB: pool}})}
	me := newUser("customer")
	admin := newUser("customer,admin")
	c.expect(404, "GET", "/riders/me/earnings", me, nil)
	c.expect(201, "POST", "/riders", me, map[string]string{"name": "Ali", "vehicle": "motorbike", "city": "Karachi"})
	rider := me["X-User-Id"]

	now := time.Now()
	delivered(t, pool, rider, 9900, 5000, 99900, now.Add(-time.Hour))    // cash on delivery, tipped
	delivered(t, pool, rider, 7900, 0, 0, now.Add(-2*time.Hour))         // paid online
	delivered(t, pool, rider, 9900, 0, 50000, now.Add(-10*24*time.Hour)) // before the last 7 days

	type money = map[string]any
	st := c.expect(200, "GET", "/riders/me/earnings", me, nil)
	period, balance := st["period"].(money), st["balance"].(money)
	if period["deliveries"] != 2.0 || period["deliveryFeesPaisa"] != 17800.0 || period["tipsPaisa"] != 5000.0 ||
		period["earnedPaisa"] != 22800.0 || period["cashCollectedPaisa"] != 99900.0 {
		t.Fatalf("period: %v", period)
	}
	// All time: earned 32700, collected 149900.
	if balance["cashInHandPaisa"] != 149900.0 || balance["unpaidEarningsPaisa"] != 32700.0 || balance["netPaisa"] != -117200.0 {
		t.Fatalf("balance: %v", balance)
	}
	from := now.Add(-11 * 24 * time.Hour).Format(time.RFC3339)
	to := now.Add(-9 * 24 * time.Hour).Format(time.RFC3339)
	old := c.expect(200, "GET", "/riders/me/earnings?from="+from+"&to="+to, me, nil)["period"].(money)
	if old["deliveries"] != 1.0 || old["earnedPaisa"] != 9900.0 {
		t.Fatalf("old period: %v", old)
	}
	c.expect(400, "GET", "/riders/me/earnings?from=yesterday", me, nil)
	c.expect(400, "GET", "/riders/me/earnings?from="+to+"&to="+from, me, nil)

	// The rider keeps what they earned out of the cash and hands in the rest.
	settle := func(want int, kind string, amount int) map[string]any {
		return c.expect(want, "POST", "/riders/"+rider+"/settlements", admin, map[string]any{"kind": kind, "amountPaisa": amount, "note": " Office, Shahrah-e-Faisal "})
	}
	c.expect(403, "POST", "/riders/"+rider+"/settlements", me, map[string]any{"kind": "payout", "amountPaisa": 100})
	c.expect(404, "POST", "/riders/"+outbox.NewID()+"/settlements", admin, map[string]any{"kind": "payout", "amountPaisa": 100})
	if out := settle(409, "payout", 32701); out["message"] != "The rider is owed only 32700 paisa" {
		t.Fatalf("over-payout: %v", out)
	}
	kept := settle(201, "kept_from_cash", 32700)
	if kept["kind"] != "kept_from_cash" || kept["amountPaisa"] != 32700.0 || kept["note"] != "Office, Shahrah-e-Faisal" ||
		kept["recordedBy"] != admin["X-User-Id"] || kept["riderId"] != rider {
		t.Fatalf("settlement: %v", kept)
	}
	settle(409, "cash_deposit", 117201)
	settle(201, "cash_deposit", 117200)
	settle(400, "refund", 100)

	balance = c.expect(200, "GET", "/riders/"+rider+"/earnings", admin, nil)["balance"].(money)
	if balance["cashInHandPaisa"] != 0.0 || balance["unpaidEarningsPaisa"] != 0.0 || balance["netPaisa"] != 0.0 {
		t.Fatalf("settled balance: %v", balance)
	}
	history := c.expect(200, "GET", "/riders/me/settlements", me, nil)["items"].([]any)
	if len(history) != 2 || history[0].(money)["kind"] != "cash_deposit" {
		t.Fatalf("history: %v", history)
	}
	c.expect(200, "GET", "/riders/"+rider+"/settlements?limit=1", admin, nil)
	c.expect(403, "GET", "/riders/"+rider+"/earnings", me, nil)
}

func TestConcurrentSettlementsCannotSpendOneBalanceTwice(t *testing.T) {
	pool := testdb.Open(t)
	c := client{t: t, h: api.New(api.Deps{DB: pool, Riders: riders.Service{DB: pool}, Earnings: earnings.Service{DB: pool}})}
	me := newUser("customer")
	admin := newUser("customer,admin")
	c.expect(201, "POST", "/riders", me, map[string]string{"name": "Ali", "vehicle": "motorbike", "city": "Karachi"})
	delivered(t, pool, me["X-User-Id"], 9900, 0, 0, time.Now())

	codes := make(chan int, 2)
	for range 2 {
		go func() {
			got, _ := c.do("POST", "/riders/"+me["X-User-Id"]+"/settlements", admin, map[string]any{"kind": "payout", "amountPaisa": 9900})
			codes <- got
		}()
	}
	if a, b := <-codes, <-codes; a+b != 201+409 {
		t.Fatalf("got %d and %d, want one 201 and one 409", a, b)
	}
}
