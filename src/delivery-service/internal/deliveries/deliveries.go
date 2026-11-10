// Package deliveries follows each order from the restaurant to the door: waiting for the
// restaurant, searching for a rider, assigned, picked up, delivered (or cancelled).
package deliveries

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/outbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/riders"
)

type Service struct {
	DB               *pgxpool.Pool
	MaxPickupMeters  float64
	LocationFreshFor time.Duration
	// Now is the clock; time.Now when nil.
	Now func() time.Time
}

func (s Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Delivery is Delivery in contracts/openapi/delivery-service.yaml.
type Delivery struct {
	ID         string `json:"id"`
	OrderID    string `json:"orderId"`
	Status     string `json:"status"`
	Restaurant struct {
		ID       string          `json:"id"`
		Name     string          `json:"name"`
		Location riders.Location `json:"location"`
	} `json:"restaurant"`
	Dropoff struct {
		Location riders.Location `json:"location"`
		Text     string          `json:"text"`
		Landmark *string         `json:"landmark"`
	} `json:"dropoff"`
	CustomerPhone      string     `json:"customerPhone"`
	CashToCollectPaisa int        `json:"cashToCollectPaisa"`
	DeliveryFeePaisa   int        `json:"deliveryFeePaisa"`
	Rider              *RiderInfo `json:"rider"`
	FoodReadyAt        *time.Time `json:"foodReadyAt"`
	AssignedAt         *time.Time `json:"assignedAt"`
	PickedUpAt         *time.Time `json:"pickedUpAt"`
	DeliveredAt        *time.Time `json:"deliveredAt"`
	CancelledAt        *time.Time `json:"cancelledAt"`
	CreatedAt          time.Time  `json:"createdAt"`
	customerID         string
}

// RiderInfo is who carries the order, as the customer and restaurant see them.
type RiderInfo struct {
	UserID   string           `json:"userId"`
	Name     string           `json:"name"`
	Phone    string           `json:"phone"`
	Vehicle  string           `json:"vehicle"`
	Location *riders.Location `json:"location"`
}

const selectDelivery = `SELECT d.id, d.order_id, d.status, d.restaurant_id, d.restaurant_name, d.pickup_lat, d.pickup_lng,
	d.dropoff_lat, d.dropoff_lng, d.dropoff_text, d.dropoff_landmark, d.customer_phone, d.cash_to_collect_paisa,
	d.delivery_fee_paisa, d.food_ready_at, d.assigned_at, d.picked_up_at, d.delivered_at, d.cancelled_at, d.created_at,
	d.customer_id, r.user_id, r.name, r.phone, r.vehicle, r.lat, r.lng
	FROM delivery.deliveries d LEFT JOIN delivery.riders r ON r.user_id = d.rider_id `

func scanDelivery(row pgx.Row) (Delivery, error) {
	var d Delivery
	var riderID, riderName, riderPhone, vehicle *string
	var lat, lng *float64
	err := row.Scan(&d.ID, &d.OrderID, &d.Status, &d.Restaurant.ID, &d.Restaurant.Name, &d.Restaurant.Location.Lat,
		&d.Restaurant.Location.Lng, &d.Dropoff.Location.Lat, &d.Dropoff.Location.Lng, &d.Dropoff.Text, &d.Dropoff.Landmark,
		&d.CustomerPhone, &d.CashToCollectPaisa, &d.DeliveryFeePaisa, &d.FoodReadyAt, &d.AssignedAt, &d.PickedUpAt,
		&d.DeliveredAt, &d.CancelledAt, &d.CreatedAt, &d.customerID, &riderID, &riderName, &riderPhone, &vehicle, &lat, &lng)
	if riderID != nil {
		d.Rider = &RiderInfo{UserID: *riderID, Name: *riderName, Phone: *riderPhone, Vehicle: *vehicle}
		if lat != nil && lng != nil {
			d.Rider.Location = &riders.Location{Lat: *lat, Lng: *lng}
		}
	}
	return d, err
}

var errNotFound = httpx.Errorf(http.StatusNotFound, "Delivery not found")

func (s Service) get(ctx context.Context, q pgx.Tx, where string, arg any) (Delivery, error) {
	var row pgx.Row
	if q != nil {
		row = q.QueryRow(ctx, selectDelivery+where, arg)
	} else {
		row = s.DB.QueryRow(ctx, selectDelivery+where, arg)
	}
	d, err := scanDelivery(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Delivery{}, errNotFound
	}
	return d, err
}

// Current is the delivery the rider is carrying or on the way to collect.
func (s Service) Current(ctx context.Context, me identity.Identity) (Delivery, error) {
	d, err := s.get(ctx, nil, `WHERE d.rider_id = $1 AND d.status IN ('assigned', 'picked_up')`, me.UserID)
	if errors.Is(err, errNotFound) {
		return Delivery{}, httpx.Errorf(http.StatusNotFound, "No delivery right now")
	}
	return d, err
}

// ForOrder shows an order's delivery to its customer, its rider and admins; 404 for anyone else.
func (s Service) ForOrder(ctx context.Context, me identity.Identity, orderID string) (Delivery, error) {
	d, err := s.get(ctx, nil, `WHERE d.order_id = $1`, orderID)
	if err != nil {
		return Delivery{}, err
	}
	if d.customerID == me.UserID || me.IsAdmin() || (d.Rider != nil && d.Rider.UserID == me.UserID) {
		return d, nil
	}
	return Delivery{}, errNotFound
}

type Page struct {
	Items   []Delivery `json:"items"`
	Page    int        `json:"page"`
	Limit   int        `json:"limit"`
	HasMore bool       `json:"hasMore"`
}

var statuses = map[string]bool{"waiting": true, "searching": true, "assigned": true, "picked_up": true, "delivered": true, "cancelled": true}

// List is for admins: deliveries with a status, newest first.
func (s Service) List(ctx context.Context, status string, page, limit int) (Page, error) {
	if !statuses[status] {
		return Page{}, httpx.Errorf(http.StatusBadRequest, "status must be one of waiting, searching, assigned, picked_up, delivered, cancelled")
	}
	rows, err := s.DB.Query(ctx, selectDelivery+`WHERE d.status = $1 ORDER BY d.created_at DESC, d.id LIMIT $2 OFFSET $3`,
		status, limit+1, (page-1)*limit)
	if err != nil {
		return Page{}, err
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Delivery, error) { return scanDelivery(row) })
	if err != nil {
		return Page{}, err
	}
	p := Page{Items: items, Page: page, Limit: limit, HasMore: len(items) > limit}
	if p.HasMore {
		p.Items = items[:limit]
	}
	if p.Items == nil {
		p.Items = []Delivery{}
	}
	return p, nil
}

// step moves the caller's delivery from one status to the next and writes its event.
func (s Service) step(ctx context.Context, me identity.Identity, id, from, to, event, column string) (Delivery, error) {
	var out Delivery
	err := pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		d, err := s.get(ctx, tx, `WHERE d.id = $1 FOR UPDATE OF d`, id)
		if err != nil {
			return err
		}
		if d.Rider == nil || d.Rider.UserID != me.UserID {
			return errNotFound
		}
		if d.Status != from {
			if d.Status == "cancelled" {
				return httpx.Errorf(http.StatusConflict, "This order was cancelled")
			}
			return httpx.Errorf(http.StatusConflict, "The delivery is %s, not %s", d.Status, from)
		}
		at := s.now().UTC()
		if _, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE delivery.deliveries SET status = $2, %s = $3, updated_at = now() WHERE id = $1`, column), id, to, at); err != nil {
			return err
		}
		if err := outbox.Add(ctx, tx, event, d.OrderID, at, map[string]any{
			"deliveryId": d.ID, "orderId": d.OrderID, "riderId": me.UserID, "at": at,
		}); err != nil {
			return err
		}
		out, err = s.get(ctx, tx, `WHERE d.id = $1`, id)
		return err
	})
	return out, err
}

// PickUp: the rider has the food. order-service hears it as delivery.picked_up.
func (s Service) PickUp(ctx context.Context, me identity.Identity, id string) (Delivery, error) {
	return s.step(ctx, me, id, "assigned", "picked_up", "delivery.picked_up", "picked_up_at")
}

// DropOff: the customer has the food (and, for cash on delivery, the rider has the cash).
func (s Service) DropOff(ctx context.Context, me identity.Identity, id string) (Delivery, error) {
	return s.step(ctx, me, id, "picked_up", "delivered", "delivery.delivered", "delivered_at")
}

// Decline hands an assigned delivery back; it goes to another rider and is never offered to this one again.
func (s Service) Decline(ctx context.Context, me identity.Identity, id string) error {
	tag, err := s.DB.Exec(ctx, `UPDATE delivery.deliveries
		SET status = 'searching', rider_id = NULL, assigned_at = NULL, declined_by = array_append(declined_by, rider_id), updated_at = now()
		WHERE id = $1 AND rider_id = $2 AND status = 'assigned'`, id, me.UserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		d, err := s.get(ctx, nil, `WHERE d.id = $1`, id)
		if err != nil || d.Rider == nil || d.Rider.UserID != me.UserID {
			return errNotFound
		}
		return httpx.Errorf(http.StatusConflict, "Only a delivery not yet picked up can be declined")
	}
	return nil
}

// Great-circle distance in metres between a rider (table alias r) and $1/$2, by the haversine formula.
const distance = `(2 * 6371000 * asin(sqrt(power(sin(radians(r.lat - $1) / 2), 2) +
	cos(radians($1)) * cos(radians(r.lat)) * power(sin(radians(r.lng - $2) / 2), 2))))`

// AssignOnce gives searching deliveries, oldest first, to the nearest free rider in range.
// Rows are locked with SKIP LOCKED, and the one-active-delivery-per-rider index backs it up,
// so concurrent assigners never double-book. Returns how many were assigned.
func (s Service) AssignOnce(ctx context.Context) (int, error) {
	rows, err := s.DB.Query(ctx, `SELECT id FROM delivery.deliveries WHERE status = 'searching' ORDER BY searching_since, id LIMIT 50`)
	if err != nil {
		return 0, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return 0, err
	}
	assigned := 0
	for _, id := range ids {
		ok, err := s.assign(ctx, id)
		if err != nil {
			return assigned, err
		}
		if ok {
			assigned++
		}
	}
	return assigned, nil
}

func (s Service) assign(ctx context.Context, id string) (bool, error) {
	ok := false
	err := pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		var orderID, customerID, customerPhone, restaurantName string
		var lat, lng float64
		var declined []string
		err := tx.QueryRow(ctx, `SELECT order_id, customer_id, customer_phone, restaurant_name, pickup_lat, pickup_lng, declined_by::text[]
			FROM delivery.deliveries WHERE id = $1 AND status = 'searching' FOR UPDATE SKIP LOCKED`, id).
			Scan(&orderID, &customerID, &customerPhone, &restaurantName, &lat, &lng, &declined)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // taken by another assigner, or no longer searching
		}
		if err != nil {
			return err
		}
		var rider RiderInfo
		err = tx.QueryRow(ctx, `SELECT r.user_id, r.name, r.phone, r.vehicle FROM delivery.riders r
			WHERE r.online AND r.status = 'approved' AND r.located_at > $3
			  AND NOT (r.user_id::text = ANY($4::text[]))
			  AND NOT EXISTS (SELECT 1 FROM delivery.deliveries x WHERE x.rider_id = r.user_id AND x.status IN ('assigned', 'picked_up'))
			  AND `+distance+` <= $5
			ORDER BY `+distance+`, r.user_id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,
			lat, lng, s.now().Add(-s.LocationFreshFor), declined, s.MaxPickupMeters).Scan(&rider.UserID, &rider.Name, &rider.Phone, &rider.Vehicle)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // nobody free nearby; tried again next round
		}
		if err != nil {
			return err
		}
		at := s.now().UTC()
		if _, err := tx.Exec(ctx, `UPDATE delivery.deliveries SET status = 'assigned', rider_id = $2, assigned_at = $3, updated_at = now()
			WHERE id = $1`, id, rider.UserID, at); err != nil {
			return err // the rider row lock prevents double-booking; the unique index is the backstop
		}
		ok = true
		return outbox.Add(ctx, tx, "delivery.assigned", orderID, at, map[string]any{
			"deliveryId": id, "orderId": orderID, "riderId": rider.UserID, "riderName": rider.Name,
			"riderPhone": rider.Phone, "vehicle": rider.Vehicle, "at": at,
			// For notification-service to tell the customer and brief the rider.
			"customerId": customerID, "customerPhone": customerPhone, "restaurantName": restaurantName,
		})
	})
	return ok, err
}

// RunAssigner matches deliveries with riders every `every` until ctx ends.
func (s Service) RunAssigner(ctx context.Context, every time.Duration) {
	for {
		if n, err := s.AssignOnce(ctx); err != nil && ctx.Err() == nil {
			slog.Error("assigning riders failed", "err", err)
		} else if n > 0 {
			slog.Info("assigned riders", "count", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(every):
		}
	}
}
