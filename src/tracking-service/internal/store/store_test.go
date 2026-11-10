package store_test

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/store"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/testredis"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/tracking"
)

func ev(typ, orderID string, data map[string]any) tracking.Envelope {
	data["orderId"] = orderID
	b, _ := json.Marshal(data)
	return tracking.Envelope{ID: testredis.NewID(), Type: typ, Data: b}
}

func TestApplySavesPublishesAndIgnoresRepeats(t *testing.T) {
	rdb := testredis.Open(t)
	ctx := t.Context()
	s := store.Store{Redis: rdb}
	hub := store.NewHub(ctx, rdb)
	defer hub.Close()
	go hub.Run(ctx)

	orderID, rider := testredis.NewID(), testredis.NewID()
	w, err := hub.Watch(ctx, orderID)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	time.Sleep(100 * time.Millisecond) // let Redis confirm the subscription

	at := time.Now().UTC()
	loc := ev("rider.location", orderID, map[string]any{"riderId": rider, "location": map[string]float64{"lat": 24.92, "lng": 67.09}, "at": at})
	if err := s.Apply(ctx, loc); err != nil {
		t.Fatal(err)
	}
	select {
	case b := <-w.C:
		var v tracking.View
		if err := json.Unmarshal(b, &v); err != nil || v.Version != 1 || v.Rider.ID != rider || v.Status != tracking.ToRestaurant {
			t.Fatalf("published %s %v", b, err)
		}
		if containsCustomer(b) {
			t.Fatalf("the view must not carry internal fields: %s", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("nothing published")
	}

	// The same event again (at-least-once delivery) changes nothing and publishes nothing.
	if err := s.Apply(ctx, loc); err != nil {
		t.Fatal(err)
	}
	st, err := s.Get(ctx, orderID)
	if err != nil || st.Version != 1 {
		t.Fatalf("after a repeat: %+v %v", st, err)
	}
	select {
	case b := <-w.C:
		t.Fatalf("published a repeat: %s", b)
	case <-time.After(300 * time.Millisecond):
	}
	if ttl := rdb.TTL(ctx, "tracking:order:"+orderID).Val(); ttl < 23*time.Hour {
		t.Fatalf("ttl %v", ttl)
	}

	if err := s.Apply(ctx, ev("delivery.delivered", orderID, map[string]any{"riderId": rider, "at": at})); err != nil {
		t.Fatal(err)
	}
	if ttl := rdb.TTL(ctx, "tracking:order:"+orderID).Val(); ttl > store.FinishedTTL {
		t.Fatalf("finished ttl %v", ttl)
	}
	if st, _ := s.Get(ctx, testredis.NewID()); st != nil {
		t.Fatal("unknown order has tracking")
	}
}

func containsCustomer(b []byte) bool {
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	_, a := m["customerId"]
	_, c := m["assignedAt"]
	return a || c
}

// Events of one order from several topics may be applied at once by different
// replicas; the optimistic update must keep every one of them.
func TestConcurrentEventsAllLand(t *testing.T) {
	rdb := testredis.Open(t)
	ctx := context.Background()
	s := store.Store{Redis: rdb}
	orderID, rider := testredis.NewID(), testredis.NewID()
	events := []tracking.Envelope{
		ev("order.placed", orderID, map[string]any{"customerId": testredis.NewID(),
			"restaurantLocation": map[string]float64{"lat": 24.92, "lng": 67.09},
			"deliveryAddress":    map[string]any{"lat": 24.93, "lng": 67.1}}),
		ev("delivery.assigned", orderID, map[string]any{"riderId": rider, "riderName": "Ali", "riderPhone": "+923001234567", "vehicle": "car", "at": time.Now()}),
		ev("delivery.picked_up", orderID, map[string]any{"riderId": rider, "at": time.Now()}),
	}
	for i := range 10 {
		events = append(events, ev("rider.location", orderID, map[string]any{"riderId": rider,
			"location": map[string]float64{"lat": 24.92, "lng": 67.09 + float64(i)/1000}, "at": time.Now().Add(time.Duration(i) * time.Second)}))
	}
	var wg sync.WaitGroup
	errs := make(chan error, len(events))
	for _, e := range events {
		wg.Go(func() { errs <- s.Apply(ctx, e) })
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	st, err := s.Get(ctx, orderID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Status != tracking.ToCustomer || st.Rider.Name != "Ali" || st.CustomerID == "" || st.RiderLocation.Lng != 67.099 || st.ETA == nil {
		t.Fatalf("state: %+v", st)
	}
}

func TestHubUnsubscribesWhenTheLastWatcherLeaves(t *testing.T) {
	rdb := testredis.Open(t)
	ctx := t.Context()
	hub := store.NewHub(ctx, rdb)
	defer hub.Close()
	go hub.Run(ctx)
	orderID := testredis.NewID()
	a, _ := hub.Watch(ctx, orderID)
	b, _ := hub.Watch(ctx, orderID)
	if hub.Watching() != 1 {
		t.Fatalf("watching %d", hub.Watching())
	}
	a.Close()
	a.Close() // twice is fine
	if hub.Watching() != 1 {
		t.Fatal("still one watcher")
	}
	b.Close()
	if hub.Watching() != 0 {
		t.Fatal("no watchers left")
	}
}
