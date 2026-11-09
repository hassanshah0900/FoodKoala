package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/api"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/deliveries"
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
