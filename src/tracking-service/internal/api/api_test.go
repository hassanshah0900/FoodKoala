package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/api"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/store"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/testredis"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/tracking"
)

type user = http.Header

func newUser(roles string) user {
	return user{"X-User-Id": {testredis.NewID()}, "X-User-Phone": {"+923001234567"}, "X-User-Roles": {roles}}
}

type fixture struct {
	t        *testing.T
	srv      *httptest.Server
	store    store.Store
	hub      *store.Hub
	orderID  string
	customer user
	rider    user
}

func setup(t *testing.T) *fixture {
	rdb := testredis.Open(t)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	st := store.Store{Redis: rdb}
	hub := store.NewHub(ctx, rdb)
	t.Cleanup(func() { _ = hub.Close() })
	go hub.Run(ctx)
	// A short resync, so a message lost before the subscription took hold is caught quickly.
	srv := httptest.NewServer(api.New(api.Deps{Store: st, Hub: hub, Resync: 200 * time.Millisecond}))
	t.Cleanup(srv.Close)
	f := &fixture{t: t, srv: srv, store: st, hub: hub, orderID: testredis.NewID(), customer: newUser("customer"), rider: newUser("customer")}
	f.apply("order.placed", map[string]any{"customerId": f.customer.Get("X-User-Id"),
		"restaurantLocation": map[string]float64{"lat": 24.92, "lng": 67.09},
		"deliveryAddress":    map[string]any{"lat": 24.935, "lng": 67.105}})
	return f
}

func (f *fixture) apply(typ string, data map[string]any) {
	f.t.Helper()
	data["orderId"] = f.orderID
	b, _ := json.Marshal(data)
	if err := f.store.Apply(context.Background(), tracking.Envelope{ID: testredis.NewID(), Type: typ, Data: b}); err != nil {
		f.t.Fatal(err)
	}
}

func (f *fixture) get(path string, who user) (int, map[string]any) {
	f.t.Helper()
	req, _ := http.NewRequest("GET", f.srv.URL+path, nil)
	for k, v := range who {
		req.Header[k] = v
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		f.t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func (f *fixture) dial(who user) (*websocket.Conn, *http.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return websocket.Dial(ctx, "ws"+strings.TrimPrefix(f.srv.URL, "http")+"/orders/"+f.orderID+"/live",
		&websocket.DialOptions{HTTPHeader: who, Subprotocols: []string{api.Subprotocol}})
}

func read(t *testing.T, c *websocket.Conn) tracking.View {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, b, err := c.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var v tracking.View
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestSnapshotIsForTheCustomerRiderAndAdmins(t *testing.T) {
	f := setup(t)
	f.apply("delivery.assigned", map[string]any{"riderId": f.rider.Get("X-User-Id"), "riderName": "Ali", "riderPhone": "+923009876543", "vehicle": "motorbike", "at": time.Now()})

	if code, _ := f.get("/healthz", nil); code != 200 {
		t.Fatal(code)
	}
	if code, _ := f.get("/readyz", nil); code != 200 {
		t.Fatal(code)
	}
	if code, _ := f.get("/orders/"+f.orderID, nil); code != 401 {
		t.Fatalf("anonymous: %d", code)
	}
	if code, _ := f.get("/orders/not-a-uuid", f.customer); code != 400 {
		t.Fatalf("bad id: %d", code)
	}
	if code, _ := f.get("/orders/"+testredis.NewID(), f.customer); code != 404 {
		t.Fatalf("unknown: %d", code)
	}
	if code, _ := f.get("/orders/"+f.orderID, newUser("customer")); code != 404 {
		t.Fatalf("stranger: %d", code)
	}
	for _, who := range []user{f.customer, f.rider, newUser("customer,admin")} {
		code, out := f.get("/orders/"+f.orderID, who)
		if code != 200 || out["status"] != "to_restaurant" || out["rider"].(map[string]any)["name"] != "Ali" || out["eta"] != nil {
			t.Fatalf("%v: %d %v", who, code, out)
		}
		if _, leaked := out["customerId"]; leaked {
			t.Fatalf("customerId leaked: %v", out)
		}
	}
}

func TestLiveSendsEveryChangeAndClosesWhenDelivered(t *testing.T) {
	f := setup(t)
	riderID := f.rider.Get("X-User-Id")

	if _, res, err := f.dial(newUser("customer")); err == nil || res == nil || res.StatusCode != 404 {
		t.Fatalf("a stranger must get 404 before the upgrade: %v %v", res, err)
	}
	if code, _ := f.get("/orders/"+f.orderID+"/live", f.customer); code != 426 {
		t.Fatalf("plain GET: %d", code)
	}

	c, res, err := f.dial(f.customer)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	if res.Header.Get("Sec-WebSocket-Protocol") != api.Subprotocol {
		t.Fatalf("subprotocol %q", res.Header.Get("Sec-WebSocket-Protocol"))
	}
	if v := read(t, c); v.Status != tracking.WaitingForRider || v.Version != 1 {
		t.Fatalf("snapshot: %+v", v)
	}

	f.apply("delivery.assigned", map[string]any{"riderId": riderID, "riderName": "Ali", "riderPhone": "+923009876543", "vehicle": "motorbike", "at": time.Now()})
	if v := read(t, c); v.Status != tracking.ToRestaurant || v.Rider.Name != "Ali" {
		t.Fatalf("assigned: %+v", v)
	}
	f.apply("rider.location", map[string]any{"riderId": riderID, "location": map[string]float64{"lat": 24.925, "lng": 67.095}, "at": time.Now()})
	v := read(t, c)
	if v.RiderLocation == nil || v.RiderLocation.Lat != 24.925 || v.ETA == nil || *v.RemainingMeters <= 0 {
		t.Fatalf("location: %+v", v)
	}
	f.apply("delivery.delivered", map[string]any{"riderId": riderID, "at": time.Now()})
	if v := read(t, c); v.Status != tracking.Delivered {
		t.Fatalf("delivered: %+v", v)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, _, err := c.Read(ctx); websocket.CloseStatus(err) != websocket.StatusNormalClosure {
		t.Fatalf("expected a normal close, got %v", err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for f.hub.Watching() != 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if f.hub.Watching() != 0 {
		t.Fatal("the socket's subscription outlived it")
	}
}
