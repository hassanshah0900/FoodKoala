// Package earnings is what riders earn (delivery fees and tips), the cash they
// collect at the door, and how admins settle both with them.
package earnings

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/outbox"
)

type Service struct {
	DB *pgxpool.Pool
}

// Period is what a rider earned from deliveries dropped off in [From, To).
type Period struct {
	From               time.Time `json:"from"`
	To                 time.Time `json:"to"`
	Deliveries         int       `json:"deliveries"`
	DeliveryFeesPaisa  int       `json:"deliveryFeesPaisa"`
	TipsPaisa          int       `json:"tipsPaisa"`
	EarnedPaisa        int       `json:"earnedPaisa"`
	CashCollectedPaisa int       `json:"cashCollectedPaisa"`
}

// Statement is Earnings in contracts/openapi/delivery-service.yaml.
type Statement struct {
	Period  Period  `json:"period"`
	Balance Balance `json:"balance"`
}

// Settlement is Settlement in the contract.
type Settlement struct {
	ID          string    `json:"id"`
	RiderID     string    `json:"riderId"`
	Kind        string    `json:"kind"`
	AmountPaisa int       `json:"amountPaisa"`
	Note        *string   `json:"note"`
	RecordedBy  string    `json:"recordedBy"`
	CreatedAt   time.Time `json:"createdAt"`
}

// NewSettlement is what an admin records.
type NewSettlement struct {
	Kind        string  `json:"kind"`
	AmountPaisa int     `json:"amountPaisa"`
	Note        *string `json:"note"`
}

var errNoRider = httpx.Errorf(http.StatusNotFound, "Rider not found")

// querier is a pool or a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Of is the rider's earnings for the period and their balance now.
func (s Service) Of(ctx context.Context, riderID string, from, to time.Time) (Statement, error) {
	if !to.After(from) {
		return Statement{}, httpx.Errorf(http.StatusBadRequest, "to must be after from")
	}
	balance, err := s.balance(ctx, s.DB, riderID, false)
	if err != nil {
		return Statement{}, err
	}
	p := Period{From: from, To: to}
	err = s.DB.QueryRow(ctx, `SELECT count(*), coalesce(sum(delivery_fee_paisa), 0), coalesce(sum(tip_paisa), 0),
			coalesce(sum(cash_to_collect_paisa), 0)
		FROM delivery.deliveries
		WHERE rider_id = $1 AND status = 'delivered' AND delivered_at >= $2 AND delivered_at < $3`,
		riderID, from, to).Scan(&p.Deliveries, &p.DeliveryFeesPaisa, &p.TipsPaisa, &p.CashCollectedPaisa)
	p.EarnedPaisa = p.DeliveryFeesPaisa + p.TipsPaisa
	return Statement{Period: p, Balance: balance}, err
}

// Settle records money between the rider and FoodKoala (admins). The rider's
// row stays locked meanwhile, so two settlements can't both spend one balance.
func (s Service) Settle(ctx context.Context, admin identity.Identity, riderID string, n NewSettlement) (Settlement, error) {
	if n.Note != nil {
		trimmed := strings.TrimSpace(*n.Note)
		if l := utf8.RuneCountInString(trimmed); l < 1 || l > 200 {
			return Settlement{}, httpx.Errorf(http.StatusBadRequest, "note must be 1 to 200 characters")
		}
		n.Note = &trimmed
	}
	var out Settlement
	err := pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		balance, err := s.balance(ctx, tx, riderID, true)
		if err != nil {
			return err
		}
		if err := balance.allow(n.Kind, n.AmountPaisa); err != nil {
			return err
		}
		out, err = scanSettlement(tx.QueryRow(ctx, `INSERT INTO delivery.settlements
			(id, rider_id, kind, amount_paisa, note, recorded_by) VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING `+settlementColumns, outbox.NewID(), riderID, n.Kind, n.AmountPaisa, n.Note, admin.UserID))
		return err
	})
	return out, err
}

// Settlements is the rider's settlement history, newest first.
func (s Service) Settlements(ctx context.Context, riderID string, page, limit int) (httpx.Page[Settlement], error) {
	if err := s.exists(ctx, s.DB, riderID, false); err != nil {
		return httpx.Page[Settlement]{}, err
	}
	rows, err := s.DB.Query(ctx, `SELECT `+settlementColumns+` FROM delivery.settlements WHERE rider_id = $1
		ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, riderID, limit+1, (page-1)*limit)
	if err != nil {
		return httpx.Page[Settlement]{}, err
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Settlement, error) { return scanSettlement(row) })
	if err != nil {
		return httpx.Page[Settlement]{}, err
	}
	return httpx.PageOf(items, page, limit), nil
}

const settlementColumns = `id, rider_id, kind, amount_paisa, note, recorded_by, created_at`

func scanSettlement(row pgx.Row) (Settlement, error) {
	var st Settlement
	err := row.Scan(&st.ID, &st.RiderID, &st.Kind, &st.AmountPaisa, &st.Note, &st.RecordedBy, &st.CreatedAt)
	return st, err
}

func (s Service) exists(ctx context.Context, q querier, riderID string, lock bool) error {
	sql := `SELECT 1 FROM delivery.riders WHERE user_id = $1`
	if lock {
		sql += ` FOR UPDATE`
	}
	var one int
	err := q.QueryRow(ctx, sql, riderID).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNoRider
	}
	return err
}

// balance is the rider's balance from everything they delivered and settled;
// with lock, their row is locked first (inside a transaction).
func (s Service) balance(ctx context.Context, q querier, riderID string, lock bool) (Balance, error) {
	if err := s.exists(ctx, q, riderID, lock); err != nil {
		return Balance{}, err
	}
	var t totals
	err := q.QueryRow(ctx, `SELECT
			(SELECT coalesce(sum(delivery_fee_paisa + tip_paisa), 0) FROM delivery.deliveries
				WHERE rider_id = $1 AND status = 'delivered'),
			(SELECT coalesce(sum(cash_to_collect_paisa), 0) FROM delivery.deliveries
				WHERE rider_id = $1 AND status = 'delivered'),
			coalesce(sum(amount_paisa) FILTER (WHERE kind IN ('cash_deposit', 'kept_from_cash')), 0),
			coalesce(sum(amount_paisa) FILTER (WHERE kind IN ('payout', 'kept_from_cash')), 0)
		FROM delivery.settlements WHERE rider_id = $1`, riderID).
		Scan(&t.earned, &t.collected, &t.cashSettled, &t.earningsSettled)
	return balanceOf(t), err
}
