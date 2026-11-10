package riders

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"

	"github.com/jackc/pgx/v5"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/inbox"
)

// Rating is Rating in contracts/openapi/delivery-service.yaml.
type Rating struct {
	Average *float64 `json:"average"`
	Count   int      `json:"count"`
}

// ratingOf is the average to one decimal (4.3), nil before the first rating.
func ratingOf(sum, count int) Rating {
	if count == 0 {
		return Rating{Count: 0}
	}
	avg := math.Round(float64(sum)/float64(count)*10) / 10
	return Rating{Average: &avg, Count: count}
}

// orderReviewed is contracts/events/order.reviewed.schema.json, the fields we use.
type orderReviewed struct {
	OrderID     string  `json:"orderId"`
	RiderID     *string `json:"riderId"`
	RiderRating *int    `json:"riderRating"`
}

// Handlers are the events riders follow, for the inbox.
func (s Service) Handlers() inbox.Handlers {
	return inbox.Handlers{"order.reviewed": s.onOrderReviewed}
}

// onOrderReviewed adds the customer's rating of the rider, if they gave one.
// The inbox applies each event once, so a replay doesn't count it twice.
func (s Service) onOrderReviewed(ctx context.Context, tx pgx.Tx, data json.RawMessage) error {
	var r orderReviewed
	if err := inbox.Decode(data, &r); err != nil {
		return err
	}
	if r.RiderID == nil || r.RiderRating == nil {
		return nil
	}
	tag, err := tx.Exec(ctx, `UPDATE delivery.riders
		SET rating_sum = rating_sum + $2, rating_count = rating_count + 1
		WHERE user_id = $1`, *r.RiderID, *r.RiderRating)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		slog.Warn("rating for an unknown rider; skipping", "order", r.OrderID, "rider", *r.RiderID)
	}
	return nil
}
