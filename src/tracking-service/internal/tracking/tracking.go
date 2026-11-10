// Package tracking folds an order's events into where its rider is and when they should arrive.
// It is pure: the store loads and saves State, this package only changes it.
package tracking

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"time"
)

// ErrMalformed means the event can never be applied; skip it so it doesn't block its partition.
var ErrMalformed = errors.New("malformed event")

// Statuses, in the order a delivery goes through them.
const (
	WaitingForRider = "waiting_for_rider"
	ToRestaurant    = "to_restaurant"
	ToCustomer      = "to_customer"
	Delivered       = "delivered"
	Cancelled       = "cancelled"
)

var rank = map[string]int{WaitingForRider: 0, ToRestaurant: 1, ToCustomer: 2, Delivered: 3, Cancelled: 3}

type Location struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type Rider struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Vehicle string `json:"vehicle"`
}

type Position struct {
	Lat float64   `json:"lat"`
	Lng float64   `json:"lng"`
	At  time.Time `json:"at"`
}

// View is Tracking in contracts/openapi/tracking-service.yaml: what callers see.
type View struct {
	OrderID         string     `json:"orderId"`
	Status          string     `json:"status"`
	Restaurant      *Location  `json:"restaurant"`
	Dropoff         *Location  `json:"dropoff"`
	Rider           *Rider     `json:"rider"`
	RiderLocation   *Position  `json:"riderLocation"`
	RemainingMeters *int       `json:"remainingMeters"`
	ETA             *time.Time `json:"eta"`
	Version         int        `json:"version"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// State is View plus what only the service needs. Events of one order come
// from several topics, so they arrive in any order: each field is filled by
// whichever event brings it first, and nothing moves a status backwards.
type State struct {
	View
	CustomerID string `json:"customerId,omitempty"`
	// When the current rider was assigned; an older delivery.assigned is stale.
	AssignedAt time.Time `json:"assignedAt,omitzero"`
}

// New is the state of an order nothing is known about yet.
func New(orderID string) *State {
	return &State{View: View{OrderID: orderID, Status: WaitingForRider}}
}

// Finished is true once delivered or cancelled: nothing changes after that.
func (s *State) Finished() bool { return rank[s.Status] == 3 }

// CanSee: the customer, the rider carrying it, and admins.
func (s *State) CanSee(userID string, admin bool) bool {
	return admin || (s.CustomerID != "" && s.CustomerID == userID) || (s.Rider != nil && s.Rider.ID == userID)
}

func (s *State) advance(to string) {
	if rank[to] > rank[s.Status] {
		s.Status = to
	}
}

// Envelope is contracts/README.md#event-envelope.
type Envelope struct {
	ID   string          `json:"id"`
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// Topics are the event types Apply understands; the consumer subscribes to them.
var Topics = []string{"order.placed", "order.status_changed", "delivery.assigned", "delivery.picked_up", "delivery.delivered", "rider.location"}

type point struct {
	Lat *float64 `json:"lat"`
	Lng *float64 `json:"lng"`
}

func (p *point) location() *Location {
	if p == nil || p.Lat == nil || p.Lng == nil {
		return nil
	}
	return &Location{Lat: *p.Lat, Lng: *p.Lng}
}

// event is the union of the fields we read from every topic's data.
type event struct {
	OrderID            string    `json:"orderId"`
	CustomerID         string    `json:"customerId"`
	RestaurantLocation *point    `json:"restaurantLocation"`
	DeliveryAddress    *point    `json:"deliveryAddress"`
	To                 string    `json:"to"`
	RiderID            string    `json:"riderId"`
	RiderName          string    `json:"riderName"`
	RiderPhone         string    `json:"riderPhone"`
	Vehicle            string    `json:"vehicle"`
	Location           *point    `json:"location"`
	At                 time.Time `json:"at"`
}

// OrderID reads which order an event is about, so the store can load it.
func OrderID(env Envelope) (string, error) {
	var e struct {
		OrderID string `json:"orderId"`
	}
	if err := json.Unmarshal(env.Data, &e); err != nil || e.OrderID == "" {
		return "", fmt.Errorf("%w: %s without an orderId", ErrMalformed, env.Type)
	}
	return e.OrderID, nil
}

// Apply changes s by one event. It is idempotent: an event seen again changes nothing.
func (s *State) Apply(env Envelope) error {
	if !slices.Contains(Topics, env.Type) {
		return fmt.Errorf("%w: type %q", ErrMalformed, env.Type)
	}
	var e event
	if err := json.Unmarshal(env.Data, &e); err != nil {
		return fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	needRider := env.Type != "order.placed" && env.Type != "order.status_changed"
	if needRider && e.RiderID == "" {
		return fmt.Errorf("%w: %s without a riderId", ErrMalformed, env.Type)
	}

	switch env.Type {
	case "order.placed":
		s.CustomerID = e.CustomerID
		s.Restaurant = e.RestaurantLocation.location()
		s.Dropoff = e.DeliveryAddress.location()
	case "order.status_changed":
		switch e.To {
		case "rejected", "cancelled":
			s.finish(Cancelled)
		case "delivered":
			s.finish(Delivered)
		case "picked_up":
			s.advance(ToCustomer)
		}
	case "delivery.assigned":
		if s.Finished() || e.At.Before(s.AssignedAt) {
			return nil // a reassignment we already know is newer
		}
		if s.Rider != nil && s.Rider.ID != e.RiderID {
			// Someone else has it now; the last rider's position means nothing.
			s.RiderLocation, s.RemainingMeters, s.ETA = nil, nil, nil
		}
		s.Rider = &Rider{ID: e.RiderID, Name: e.RiderName, Phone: e.RiderPhone, Vehicle: e.Vehicle}
		s.AssignedAt = e.At
		s.advance(ToRestaurant)
	case "delivery.picked_up":
		if s.Finished() {
			return nil
		}
		s.knowRider(e.RiderID)
		s.advance(ToCustomer)
	case "delivery.delivered":
		s.finish(Delivered)
	case "rider.location":
		at := e.Location.location()
		if at == nil {
			return fmt.Errorf("%w: rider.location without a location", ErrMalformed)
		}
		if s.Finished() || (s.Rider != nil && s.Rider.ID != e.RiderID) ||
			(s.RiderLocation != nil && !e.At.After(s.RiderLocation.At)) {
			return nil // late, or from a rider who no longer has the order
		}
		s.knowRider(e.RiderID)
		s.RiderLocation = &Position{Lat: at.Lat, Lng: at.Lng, At: e.At}
		s.advance(ToRestaurant)
	}
	s.estimate()
	return nil
}

// knowRider records the rider when an event about them beats delivery.assigned here.
func (s *State) knowRider(id string) {
	if s.Rider == nil {
		s.Rider = &Rider{ID: id}
	}
}

func (s *State) finish(status string) {
	if s.Finished() {
		return
	}
	s.Status = status
}

// RoadFactor turns a straight line into a typical city route.
const RoadFactor = 1.35

// Typical city speeds in metres per second, by vehicle.
var speed = map[string]float64{"motorbike": 25 / 3.6, "car": 20 / 3.6, "bicycle": 12 / 3.6}

// estimate sets how far the rider still has to ride and when they should reach the door.
func (s *State) estimate() {
	s.RemainingMeters, s.ETA = nil, nil
	switch {
	case s.Status == Delivered:
		zero := 0
		s.RemainingMeters = &zero
		return
	case s.Finished() || s.RiderLocation == nil || s.Dropoff == nil:
		return
	}
	here := Location{Lat: s.RiderLocation.Lat, Lng: s.RiderLocation.Lng}
	var straight float64
	if s.Status == ToRestaurant {
		if s.Restaurant == nil {
			return
		}
		straight = Distance(here, *s.Restaurant) + Distance(*s.Restaurant, *s.Dropoff)
	} else {
		straight = Distance(here, *s.Dropoff)
	}
	meters := int(math.Round(straight * RoadFactor))
	v := speed["motorbike"]
	if s.Rider != nil && speed[s.Rider.Vehicle] > 0 {
		v = speed[s.Rider.Vehicle]
	}
	eta := s.RiderLocation.At.Add(time.Duration(float64(meters) / v * float64(time.Second))).UTC().Truncate(time.Second)
	s.RemainingMeters, s.ETA = &meters, &eta
}

// Distance is the great-circle distance in metres.
func Distance(a, b Location) float64 {
	const earth = 6371000.0
	rad := math.Pi / 180
	dLat, dLng := (b.Lat-a.Lat)*rad, (b.Lng-a.Lng)*rad
	h := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(a.Lat*rad)*math.Cos(b.Lat*rad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * earth * math.Asin(math.Sqrt(h))
}
