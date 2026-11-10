package tracking

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
	"time"
)

const order = "0b9a4f9e-1111-4c55-9a6b-3f1c2b8a9d10"

var (
	riderA = "7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10"
	riderB = "8e4d9f9f-4b1f-4d66-8b7c-4a2d3c9b0e21"
	t0     = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	// Restaurant in Gulshan, door ~2.2 km north-east.
	restaurant = Location{Lat: 24.9200, Lng: 67.0900}
	door       = Location{Lat: 24.9350, Lng: 67.1050}
)

func ev(typ string, data map[string]any) Envelope {
	data["orderId"] = order
	b, _ := json.Marshal(data)
	return Envelope{ID: typ, Type: typ, Data: b}
}

func placed() Envelope {
	return ev("order.placed", map[string]any{
		"customerId":         "c0000000-0000-4000-8000-000000000001",
		"restaurantLocation": map[string]float64{"lat": restaurant.Lat, "lng": restaurant.Lng},
		"deliveryAddress":    map[string]any{"lat": door.Lat, "lng": door.Lng, "text": "House 7"},
	})
}

func assigned(rider string, at time.Time) Envelope {
	return ev("delivery.assigned", map[string]any{"riderId": rider, "riderName": "Ali", "riderPhone": "+923001234567", "vehicle": "motorbike", "at": at})
}

func located(rider string, at time.Time, l Location) Envelope {
	return ev("rider.location", map[string]any{"riderId": rider, "location": l, "at": at})
}

func apply(t *testing.T, s *State, events ...Envelope) {
	t.Helper()
	for _, e := range events {
		if err := s.Apply(e); err != nil {
			t.Fatalf("%s: %v", e.Type, err)
		}
	}
}

func TestAFullDelivery(t *testing.T) {
	s := New(order)
	apply(t, s, placed())
	if s.Status != WaitingForRider || s.CustomerID == "" || *s.Dropoff != door || s.ETA != nil {
		t.Fatalf("placed: %+v", s)
	}
	apply(t, s, assigned(riderA, t0), located(riderA, t0.Add(time.Second), Location{Lat: 24.91, Lng: 67.08}))
	if s.Status != ToRestaurant || s.Rider.Name != "Ali" || s.ETA == nil {
		t.Fatalf("assigned: %+v", s)
	}
	// Before pickup the ride counts the way to the restaurant and on to the door.
	toRestaurant := Distance(Location{Lat: 24.91, Lng: 67.08}, restaurant) + Distance(restaurant, door)
	if want := int(math.Round(toRestaurant * RoadFactor)); *s.RemainingMeters != want {
		t.Fatalf("remaining %d, want %d", *s.RemainingMeters, want)
	}
	firstETA := *s.ETA

	apply(t, s, ev("delivery.picked_up", map[string]any{"riderId": riderA, "at": t0.Add(5 * time.Minute)}),
		located(riderA, t0.Add(6*time.Minute), restaurant))
	if s.Status != ToCustomer {
		t.Fatalf("picked up: %s", s.Status)
	}
	meters := Distance(restaurant, door) * RoadFactor
	wantETA := t0.Add(6*time.Minute + time.Duration(math.Round(meters)/(25/3.6)*float64(time.Second))).Truncate(time.Second)
	if !s.ETA.Equal(wantETA) || !s.ETA.After(firstETA) {
		t.Fatalf("eta %v, want %v", s.ETA, wantETA)
	}

	apply(t, s, ev("delivery.delivered", map[string]any{"riderId": riderA, "at": t0.Add(15 * time.Minute)}))
	if s.Status != Delivered || *s.RemainingMeters != 0 || s.ETA != nil || !s.Finished() {
		t.Fatalf("delivered: %+v", s)
	}
	// Nothing moves a finished order.
	apply(t, s, located(riderA, t0.Add(16*time.Minute), door), ev("order.status_changed", map[string]any{"to": "cancelled"}))
	if s.Status != Delivered || s.RiderLocation.At != t0.Add(6*time.Minute) {
		t.Fatalf("after delivery: %+v", s)
	}
}

func TestEventsInAnyOrder(t *testing.T) {
	// Rider events beat order.placed and delivery.assigned (other topics).
	s := New(order)
	apply(t, s, located(riderA, t0.Add(2*time.Second), restaurant))
	if s.Status != ToRestaurant || s.Rider.ID != riderA || s.ETA != nil {
		t.Fatalf("location first: %+v", s)
	}
	apply(t, s, ev("delivery.picked_up", map[string]any{"riderId": riderA, "at": t0.Add(time.Minute)}), assigned(riderA, t0), placed())
	if s.Status != ToCustomer || s.Rider.Name != "Ali" || s.ETA == nil || s.CustomerID == "" {
		t.Fatalf("all in: %+v", s)
	}
	// An older ping changes nothing.
	apply(t, s, located(riderA, t0.Add(time.Second), door))
	if s.RiderLocation.Lat != restaurant.Lat {
		t.Fatalf("older ping applied: %+v", s.RiderLocation)
	}
}

func TestReassignment(t *testing.T) {
	s := New(order)
	apply(t, s, placed(), assigned(riderA, t0), located(riderA, t0.Add(time.Second), restaurant))
	apply(t, s, assigned(riderB, t0.Add(time.Minute)))
	if s.Rider.ID != riderB || s.RiderLocation != nil || s.ETA != nil {
		t.Fatalf("reassigned: %+v", s)
	}
	// The first rider's late ping and late assignment are ignored.
	apply(t, s, located(riderA, t0.Add(2*time.Minute), restaurant), assigned(riderA, t0))
	if s.Rider.ID != riderB || s.RiderLocation != nil {
		t.Fatalf("stale rider: %+v", s)
	}
}

func TestCancelled(t *testing.T) {
	s := New(order)
	apply(t, s, placed(), assigned(riderA, t0), located(riderA, t0, restaurant), ev("order.status_changed", map[string]any{"to": "rejected"}))
	if s.Status != Cancelled || s.ETA != nil || s.RemainingMeters != nil {
		t.Fatalf("cancelled: %+v", s)
	}
}

func TestWhoMaySee(t *testing.T) {
	s := New(order)
	if s.CanSee("c0000000-0000-4000-8000-000000000001", false) || s.CanSee("", false) || !s.CanSee("x", true) {
		t.Fatal("before anything is known only admins see it")
	}
	apply(t, s, placed(), assigned(riderA, t0))
	if !s.CanSee("c0000000-0000-4000-8000-000000000001", false) || !s.CanSee(riderA, false) || s.CanSee(riderB, false) {
		t.Fatal("customer and rider see it, others don't")
	}
}

func TestMalformed(t *testing.T) {
	s := New(order)
	for _, e := range []Envelope{
		{Type: "order.paid", Data: []byte(`{}`)},
		{Type: "rider.location", Data: []byte(`{"orderId":"x","riderId":"r"}`)},
		{Type: "delivery.assigned", Data: []byte(`{"orderId":"x"}`)},
		{Type: "order.placed", Data: []byte(`[]`)},
	} {
		if err := s.Apply(e); !errors.Is(err, ErrMalformed) {
			t.Errorf("%s %s: %v", e.Type, e.Data, err)
		}
	}
	if _, err := OrderID(Envelope{Type: "order.placed", Data: []byte(`{}`)}); !errors.Is(err, ErrMalformed) {
		t.Error("an event without an orderId is malformed")
	}
}

func TestDistance(t *testing.T) {
	// Karachi to Lahore is about 1,030 km as the crow flies.
	if d := Distance(Location{Lat: 24.8607, Lng: 67.0011}, Location{Lat: 31.5204, Lng: 74.3587}); d < 1.02e6 || d > 1.04e6 {
		t.Fatalf("distance %f", d)
	}
}
