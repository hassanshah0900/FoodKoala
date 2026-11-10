// Package riders is rider sign-up, approval, shifts (online/offline) and location.
package riders

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/identity"
)

// Location is WGS 84, inside Pakistan (the bounds every contract uses).
type Location struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

func (l Location) Valid() bool {
	return l.Lat >= 23.5 && l.Lat <= 37.1 && l.Lng >= 60.8 && l.Lng <= 77.9
}

// Rider is Rider in contracts/openapi/delivery-service.yaml.
type Rider struct {
	UserID    string     `json:"userId"`
	Name      string     `json:"name"`
	Phone     string     `json:"phone"`
	Vehicle   string     `json:"vehicle"`
	City      string     `json:"city"`
	Status    string     `json:"status"`
	Online    bool       `json:"online"`
	Location  *Location  `json:"location"`
	LocatedAt *time.Time `json:"locatedAt"`
	Rating    Rating     `json:"rating"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

const columns = `user_id, name, phone, vehicle, city, status, online, lat, lng, located_at, rating_sum, rating_count, created_at, updated_at`

func scan(row pgx.Row) (Rider, error) {
	var r Rider
	var lat, lng *float64
	var ratingSum, ratingCount int
	err := row.Scan(&r.UserID, &r.Name, &r.Phone, &r.Vehicle, &r.City, &r.Status, &r.Online, &lat, &lng, &r.LocatedAt,
		&ratingSum, &ratingCount, &r.CreatedAt, &r.UpdatedAt)
	r.Rating = ratingOf(ratingSum, ratingCount)
	if lat != nil && lng != nil {
		r.Location = &Location{Lat: *lat, Lng: *lng}
	}
	return r, err
}

var vehicles = map[string]bool{"motorbike": true, "bicycle": true, "car": true}

// Application is what a user sends to become a rider.
type Application struct {
	Name    string `json:"name"`
	Vehicle string `json:"vehicle"`
	City    string `json:"city"`
}

func (a *Application) validate() error {
	a.Name, a.City = strings.TrimSpace(a.Name), strings.TrimSpace(a.City)
	var problems []string
	if n := utf8.RuneCountInString(a.Name); n < 2 || n > 80 {
		problems = append(problems, "name must be 2 to 80 characters")
	}
	if !vehicles[a.Vehicle] {
		problems = append(problems, "vehicle must be motorbike, bicycle or car")
	}
	if n := utf8.RuneCountInString(a.City); n < 2 || n > 60 {
		problems = append(problems, "city must be 2 to 60 characters")
	}
	if problems != nil {
		return httpx.Errorf(http.StatusBadRequest, "%s", strings.Join(problems, "; "))
	}
	return nil
}

// Sender publishes an event without the outbox, best effort (outbox.Direct).
type Sender interface {
	Send(ctx context.Context, topic, key string, at time.Time, data any)
}

type Service struct {
	DB *pgxpool.Pool
	// Where rider.location goes; nil sends nothing (no Kafka).
	Locations Sender
}

var errNotRider = httpx.Errorf(http.StatusNotFound, "You have not applied to ride")

// Apply registers the caller as a pending rider; their phone comes from their login.
func (s Service) Apply(ctx context.Context, me identity.Identity, a Application) (Rider, error) {
	if err := a.validate(); err != nil {
		return Rider{}, err
	}
	r, err := scan(s.DB.QueryRow(ctx, `INSERT INTO delivery.riders (user_id, name, phone, vehicle, city)
		VALUES ($1, $2, $3, $4, $5) RETURNING `+columns, me.UserID, a.Name, me.Phone, a.Vehicle, a.City))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Rider{}, httpx.Errorf(http.StatusConflict, "You have already applied")
	}
	return r, err
}

func (s Service) Get(ctx context.Context, userID string) (Rider, error) {
	r, err := scan(s.DB.QueryRow(ctx, `SELECT `+columns+` FROM delivery.riders WHERE user_id = $1`, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Rider{}, errNotRider
	}
	return r, err
}

// GoOnline starts a shift at `at`; only approved riders may.
func (s Service) GoOnline(ctx context.Context, me identity.Identity, at Location) (Rider, error) {
	if !at.Valid() {
		return Rider{}, httpx.Errorf(http.StatusBadRequest, "location must be in Pakistan")
	}
	current, err := s.Get(ctx, me.UserID)
	if err != nil {
		return Rider{}, err
	}
	if current.Status != "approved" {
		return Rider{}, httpx.Errorf(http.StatusForbidden, "Your rider account is %s", current.Status)
	}
	return scan(s.DB.QueryRow(ctx, `UPDATE delivery.riders SET online = true, lat = $2, lng = $3, located_at = now(), updated_at = now()
		WHERE user_id = $1 RETURNING `+columns, me.UserID, at.Lat, at.Lng))
}

// GoOffline ends the shift; not while carrying an order.
func (s Service) GoOffline(ctx context.Context, me identity.Identity) (Rider, error) {
	if _, err := s.Get(ctx, me.UserID); err != nil {
		return Rider{}, err
	}
	r, err := scan(s.DB.QueryRow(ctx, `UPDATE delivery.riders SET online = false, updated_at = now()
		WHERE user_id = $1 AND NOT EXISTS (
			SELECT 1 FROM delivery.deliveries WHERE rider_id = $1 AND status IN ('assigned', 'picked_up'))
		RETURNING `+columns, me.UserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Rider{}, httpx.Errorf(http.StatusConflict, "Finish your delivery before going offline")
	}
	return r, err
}

// UpdateLocation records where an online rider is now. While they carry an
// order the position also goes out as rider.location, for tracking-service.
func (s Service) UpdateLocation(ctx context.Context, me identity.Identity, at Location) error {
	if !at.Valid() {
		return httpx.Errorf(http.StatusBadRequest, "location must be in Pakistan")
	}
	var locatedAt time.Time
	var deliveryID, orderID *string
	err := s.DB.QueryRow(ctx, `WITH moved AS (
			UPDATE delivery.riders SET lat = $2, lng = $3, located_at = now(), updated_at = now()
			WHERE user_id = $1 AND online RETURNING user_id, located_at)
		SELECT m.located_at, d.id, d.order_id FROM moved m
		LEFT JOIN delivery.deliveries d ON d.rider_id = m.user_id AND d.status IN ('assigned', 'picked_up')`,
		me.UserID, at.Lat, at.Lng).Scan(&locatedAt, &deliveryID, &orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		if _, err := s.Get(ctx, me.UserID); err != nil {
			return err
		}
		return httpx.Errorf(http.StatusConflict, "Go online first")
	}
	if err != nil {
		return err
	}
	if s.Locations != nil && orderID != nil {
		s.Locations.Send(ctx, "rider.location", *orderID, locatedAt, map[string]any{
			"deliveryId": *deliveryID, "orderId": *orderID, "riderId": me.UserID,
			"location": at, "at": locatedAt.UTC(),
		})
	}
	return nil
}

type Page = httpx.Page[Rider]

var statuses = map[string]bool{"pending": true, "approved": true, "suspended": true}

// List is for admins: riders with a status, oldest application first.
func (s Service) List(ctx context.Context, status string, page, limit int) (Page, error) {
	if !statuses[status] {
		return Page{}, httpx.Errorf(http.StatusBadRequest, "status must be pending, approved or suspended")
	}
	rows, err := s.DB.Query(ctx, `SELECT `+columns+` FROM delivery.riders WHERE status = $1
		ORDER BY created_at, user_id LIMIT $2 OFFSET $3`, status, limit+1, (page-1)*limit)
	if err != nil {
		return Page{}, err
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Rider, error) { return scan(row) })
	if err != nil {
		return Page{}, err
	}
	return httpx.PageOf(items, page, limit), nil
}

// SetStatus approves, suspends or returns a rider to pending (admins). Suspension ends their shift.
func (s Service) SetStatus(ctx context.Context, userID, status string) (Rider, error) {
	if !statuses[status] {
		return Rider{}, httpx.Errorf(http.StatusBadRequest, "status must be pending, approved or suspended")
	}
	if _, err := s.Get(ctx, userID); err != nil {
		return Rider{}, httpx.Errorf(http.StatusNotFound, "Rider not found")
	}
	r, err := scan(s.DB.QueryRow(ctx, `UPDATE delivery.riders
		SET status = $2::delivery.rider_status, online = online AND $2::text = 'approved', updated_at = now()
		WHERE user_id = $1 AND ($2::text = 'approved' OR NOT EXISTS (
			SELECT 1 FROM delivery.deliveries WHERE rider_id = $1 AND status IN ('assigned', 'picked_up')))
		RETURNING `+columns, userID, status))
	if errors.Is(err, pgx.ErrNoRows) {
		return Rider{}, httpx.Errorf(http.StatusConflict, "The rider is carrying an order; reassign it first")
	}
	return r, err
}
