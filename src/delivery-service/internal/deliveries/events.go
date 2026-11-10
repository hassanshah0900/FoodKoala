package deliveries

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/inbox"
)

// How long a status change may wait for its order.placed. Older orders (e.g. placed
// before delivery-service ran) have no delivery and never will; their events are skipped.
const waitForPlaced = 10 * time.Minute

type location struct {
	Lat *float64 `json:"lat"`
	Lng *float64 `json:"lng"`
}

func (l *location) ok() bool { return l != nil && l.Lat != nil && l.Lng != nil }

// orderPlaced is contracts/events/order.placed.schema.json, the fields we use.
type orderPlaced struct {
	OrderID            string    `json:"orderId"`
	CustomerID         string    `json:"customerId"`
	CustomerPhone      string    `json:"customerPhone"`
	RestaurantID       string    `json:"restaurantId"`
	RestaurantName     string    `json:"restaurantName"`
	RestaurantLocation *location `json:"restaurantLocation"`
	Totals             struct {
		DeliveryFeePaisa *int `json:"deliveryFeePaisa"`
		TotalPaisa       *int `json:"totalPaisa"`
		// Absent in orders placed before tips.
		TipPaisa *int `json:"tipPaisa"`
	} `json:"totals"`
	PaymentMethod   string `json:"paymentMethod"`
	DeliveryAddress struct {
		location
		Text     string  `json:"text"`
		Landmark *string `json:"landmark"`
	} `json:"deliveryAddress"`
}

// orderStatusChanged is contracts/events/order.status_changed.schema.json, the fields we use.
type orderStatusChanged struct {
	OrderID string    `json:"orderId"`
	To      string    `json:"to"`
	By      string    `json:"by"`
	At      time.Time `json:"at"`
}

// Handlers are the order events deliveries follow, for the inbox.
func (s Service) Handlers() inbox.Handlers {
	return inbox.Handlers{
		"order.placed":         s.onPlaced,
		"order.status_changed": s.onStatusChanged,
	}
}

func (s Service) onPlaced(ctx context.Context, tx pgx.Tx, data json.RawMessage) error {
	var d orderPlaced
	if err := inbox.Decode(data, &d); err != nil {
		return err
	}
	return s.placed(ctx, tx, d)
}

func (s Service) onStatusChanged(ctx context.Context, tx pgx.Tx, data json.RawMessage) error {
	var d orderStatusChanged
	if err := inbox.Decode(data, &d); err != nil {
		return err
	}
	if d.OrderID == "" {
		return fmt.Errorf("%w: no orderId", inbox.ErrMalformed)
	}
	return s.statusChanged(ctx, tx, d)
}

func (s Service) placed(ctx context.Context, tx pgx.Tx, d orderPlaced) error {
	if !d.RestaurantLocation.ok() || !d.DeliveryAddress.ok() || d.Totals.TotalPaisa == nil || d.Totals.DeliveryFeePaisa == nil {
		return fmt.Errorf("%w: order %s lacks a location or totals", inbox.ErrMalformed, d.OrderID)
	}
	cash, tip := 0, 0
	if d.PaymentMethod == "cod" {
		cash = *d.Totals.TotalPaisa
	}
	if d.Totals.TipPaisa != nil {
		tip = *d.Totals.TipPaisa
	}
	_, err := tx.Exec(ctx, `INSERT INTO delivery.deliveries
		(id, order_id, customer_id, customer_phone, restaurant_id, restaurant_name, pickup_lat, pickup_lng,
		 dropoff_lat, dropoff_lng, dropoff_text, dropoff_landmark, cash_to_collect_paisa, delivery_fee_paisa, tip_paisa)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		ON CONFLICT (order_id) DO NOTHING`,
		d.OrderID, d.CustomerID, d.CustomerPhone, d.RestaurantID, d.RestaurantName,
		*d.RestaurantLocation.Lat, *d.RestaurantLocation.Lng, *d.DeliveryAddress.Lat, *d.DeliveryAddress.Lng,
		d.DeliveryAddress.Text, d.DeliveryAddress.Landmark, cash, *d.Totals.DeliveryFeePaisa, tip)
	return err
}

func (s Service) statusChanged(ctx context.Context, tx pgx.Tx, d orderStatusChanged) error {
	var status string
	var riderID *string
	err := tx.QueryRow(ctx, `SELECT status, rider_id FROM delivery.deliveries WHERE order_id = $1 FOR UPDATE`, d.OrderID).Scan(&status, &riderID)
	if errors.Is(err, pgx.ErrNoRows) {
		if s.now().Sub(d.At) > waitForPlaced {
			slog.Warn("status change for an order without a delivery; skipping", "order", d.OrderID, "to", d.To)
			return nil
		}
		return inbox.ErrNotYet
	}
	if err != nil {
		return err
	}
	if d.By == "rider" {
		return nil // our own pickup or drop-off coming back through order-service
	}
	exec := func(sql string) error { _, err := tx.Exec(ctx, sql, d.OrderID, d.At); return err }
	switch d.To {
	case "accepted":
		return exec(`UPDATE delivery.deliveries SET status = 'searching', searching_since = $2, updated_at = now()
			WHERE order_id = $1 AND status = 'waiting'`)
	case "ready":
		return exec(`UPDATE delivery.deliveries SET food_ready_at = $2, updated_at = now() WHERE order_id = $1`)
	case "rejected", "cancelled":
		return exec(`UPDATE delivery.deliveries SET status = 'cancelled', cancelled_at = $2, updated_at = now()
			WHERE order_id = $1 AND status NOT IN ('delivered', 'cancelled')`)
	case "picked_up", "delivered":
		// An admin recorded it by hand. With a rider, follow along; without one, the
		// order is being handled outside delivery-service, so stop looking for a rider.
		if riderID == nil {
			return exec(`UPDATE delivery.deliveries SET status = 'cancelled', cancelled_at = $2, updated_at = now()
				WHERE order_id = $1 AND status IN ('waiting', 'searching')`)
		}
		if d.To == "picked_up" {
			return exec(`UPDATE delivery.deliveries SET status = 'picked_up', picked_up_at = $2, updated_at = now()
				WHERE order_id = $1 AND status = 'assigned'`)
		}
		return exec(`UPDATE delivery.deliveries SET status = 'delivered', delivered_at = $2,
			picked_up_at = coalesce(picked_up_at, $2), updated_at = now()
			WHERE order_id = $1 AND status IN ('assigned', 'picked_up')`)
	}
	return nil
}
