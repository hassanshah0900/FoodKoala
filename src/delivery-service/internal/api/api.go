// Package api wires delivery-service's HTTP routes (contracts/openapi/delivery-service.yaml).
// Behind api-gateway they live under /api/v1/delivery.
package api

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/deliveries"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/earnings"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/riders"
)

type Deps struct {
	DB         *pgxpool.Pool
	Riders     riders.Service
	Deliveries deliveries.Service
	Earnings   earnings.Service
	// ConsumerAlive reports whether order events are being consumed; nil when Kafka is off.
	ConsumerAlive func() bool
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func id(r *http.Request, name string) (string, error) {
	v := r.PathValue(name)
	if !uuidRe.MatchString(v) {
		return "", httpx.Errorf(http.StatusBadRequest, "%s must be a UUID", name)
	}
	return v, nil
}

func paging(r *http.Request) (page, limit int, err error) {
	page, limit = 1, 20
	if v := r.URL.Query().Get("page"); v != "" {
		if page, err = strconv.Atoi(v); err != nil || page < 1 {
			return 0, 0, httpx.Errorf(http.StatusBadRequest, "page must be a positive integer")
		}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if limit, err = strconv.Atoi(v); err != nil || limit < 1 || limit > 50 {
			return 0, 0, httpx.Errorf(http.StatusBadRequest, "limit must be 1 to 50")
		}
	}
	return page, limit, nil
}

// defaultPeriod is the earnings window when the query names none: the last 7 days.
const defaultPeriod = 7 * 24 * time.Hour

// period reads ?from=&to= (RFC 3339), each defaulting from the other or from now.
func period(r *http.Request) (from, to time.Time, err error) {
	parse := func(name string, def time.Time) (time.Time, error) {
		v := r.URL.Query().Get(name)
		if v == "" {
			return def, nil
		}
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return time.Time{}, httpx.Errorf(http.StatusBadRequest, "%s must be an RFC 3339 time, e.g. 2026-11-01T00:00:00+05:00", name)
		}
		return t, nil
	}
	if to, err = parse("to", time.Now()); err != nil {
		return
	}
	from, err = parse("from", to.Add(-defaultPeriod))
	return
}

func reply(w http.ResponseWriter, status int, v any, err error) error {
	if err != nil {
		return err
	}
	if v == nil {
		w.WriteHeader(status)
		return nil
	}
	httpx.WriteJSON(w, status, v)
	return nil
}

func New(d Deps) http.Handler {
	mux := http.NewServeMux()
	user := func(h httpx.Handler) http.Handler { return identity.Require(h) }
	admin := func(h httpx.Handler) http.Handler { return identity.RequireAdmin(h) }

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := d.DB.Ping(ctx); err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "postgres": "down"})
			return
		}
		if d.ConsumerAlive != nil && !d.ConsumerAlive() {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "consumer": "stopped"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Riders: sign-up, shifts and location.
	mux.Handle("POST /riders", user(func(w http.ResponseWriter, r *http.Request) error {
		var a riders.Application
		if err := httpx.Decode(r, &a); err != nil {
			return err
		}
		rider, err := d.Riders.Apply(r.Context(), identity.From(r), a)
		return reply(w, http.StatusCreated, rider, err)
	}))
	mux.Handle("GET /riders/me", user(func(w http.ResponseWriter, r *http.Request) error {
		rider, err := d.Riders.Get(r.Context(), identity.From(r).UserID)
		return reply(w, http.StatusOK, rider, err)
	}))
	mux.Handle("POST /riders/me/online", user(func(w http.ResponseWriter, r *http.Request) error {
		var body struct {
			Location riders.Location `json:"location"`
		}
		if err := httpx.Decode(r, &body); err != nil {
			return err
		}
		rider, err := d.Riders.GoOnline(r.Context(), identity.From(r), body.Location)
		return reply(w, http.StatusOK, rider, err)
	}))
	mux.Handle("POST /riders/me/offline", user(func(w http.ResponseWriter, r *http.Request) error {
		rider, err := d.Riders.GoOffline(r.Context(), identity.From(r))
		return reply(w, http.StatusOK, rider, err)
	}))
	mux.Handle("PUT /riders/me/location", user(func(w http.ResponseWriter, r *http.Request) error {
		var at riders.Location
		if err := httpx.Decode(r, &at); err != nil {
			return err
		}
		return reply(w, http.StatusNoContent, nil, d.Riders.UpdateLocation(r.Context(), identity.From(r), at))
	}))
	mux.Handle("GET /riders/me/delivery", user(func(w http.ResponseWriter, r *http.Request) error {
		del, err := d.Deliveries.Current(r.Context(), identity.From(r))
		return reply(w, http.StatusOK, del, err)
	}))

	// Earnings and settlements: the rider's own under /riders/me, any rider's for admins.
	mine := func(r *http.Request) (string, error) { return identity.From(r).UserID, nil }
	pathRider := func(r *http.Request) (string, error) { return id(r, "userId") }
	statement := func(whose func(*http.Request) (string, error)) httpx.Handler {
		return func(w http.ResponseWriter, r *http.Request) error {
			riderID, err := whose(r)
			if err != nil {
				return err
			}
			from, to, err := period(r)
			if err != nil {
				return err
			}
			st, err := d.Earnings.Of(r.Context(), riderID, from, to)
			return reply(w, http.StatusOK, st, err)
		}
	}
	settlements := func(whose func(*http.Request) (string, error)) httpx.Handler {
		return func(w http.ResponseWriter, r *http.Request) error {
			riderID, err := whose(r)
			if err != nil {
				return err
			}
			page, limit, err := paging(r)
			if err != nil {
				return err
			}
			p, err := d.Earnings.Settlements(r.Context(), riderID, page, limit)
			return reply(w, http.StatusOK, p, err)
		}
	}
	mux.Handle("GET /riders/me/earnings", user(statement(mine)))
	mux.Handle("GET /riders/me/settlements", user(settlements(mine)))
	mux.Handle("GET /riders/{userId}/earnings", admin(statement(pathRider)))
	mux.Handle("GET /riders/{userId}/settlements", admin(settlements(pathRider)))
	mux.Handle("POST /riders/{userId}/settlements", admin(func(w http.ResponseWriter, r *http.Request) error {
		riderID, err := id(r, "userId")
		if err != nil {
			return err
		}
		var body earnings.NewSettlement
		if err := httpx.Decode(r, &body); err != nil {
			return err
		}
		st, err := d.Earnings.Settle(r.Context(), identity.From(r), riderID, body)
		return reply(w, http.StatusCreated, st, err)
	}))

	// Admins: review riders, watch deliveries.
	mux.Handle("GET /riders", admin(func(w http.ResponseWriter, r *http.Request) error {
		page, limit, err := paging(r)
		if err != nil {
			return err
		}
		status := r.URL.Query().Get("status")
		if status == "" {
			status = "pending"
		}
		p, err := d.Riders.List(r.Context(), status, page, limit)
		return reply(w, http.StatusOK, p, err)
	}))
	mux.Handle("GET /riders/{userId}", admin(func(w http.ResponseWriter, r *http.Request) error {
		userID, err := id(r, "userId")
		if err != nil {
			return err
		}
		rider, err := d.Riders.Get(r.Context(), userID)
		return reply(w, http.StatusOK, rider, err)
	}))
	mux.Handle("POST /riders/{userId}/status", admin(func(w http.ResponseWriter, r *http.Request) error {
		userID, err := id(r, "userId")
		if err != nil {
			return err
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := httpx.Decode(r, &body); err != nil {
			return err
		}
		rider, err := d.Riders.SetStatus(r.Context(), userID, body.Status)
		return reply(w, http.StatusOK, rider, err)
	}))
	mux.Handle("GET /deliveries", admin(func(w http.ResponseWriter, r *http.Request) error {
		page, limit, err := paging(r)
		if err != nil {
			return err
		}
		status := r.URL.Query().Get("status")
		if status == "" {
			status = "searching"
		}
		p, err := d.Deliveries.List(r.Context(), status, page, limit)
		return reply(w, http.StatusOK, p, err)
	}))

	// An order's delivery, for its customer, rider and admins.
	mux.Handle("GET /deliveries/orders/{orderId}", user(func(w http.ResponseWriter, r *http.Request) error {
		orderID, err := id(r, "orderId")
		if err != nil {
			return err
		}
		del, err := d.Deliveries.ForOrder(r.Context(), identity.From(r), orderID)
		return reply(w, http.StatusOK, del, err)
	}))

	// The rider's steps.
	step := func(do func(context.Context, identity.Identity, string) (deliveries.Delivery, error)) http.Handler {
		return user(func(w http.ResponseWriter, r *http.Request) error {
			deliveryID, err := id(r, "id")
			if err != nil {
				return err
			}
			del, err := do(r.Context(), identity.From(r), deliveryID)
			return reply(w, http.StatusOK, del, err)
		})
	}
	mux.Handle("POST /deliveries/{id}/pickup", step(d.Deliveries.PickUp))
	mux.Handle("POST /deliveries/{id}/dropoff", step(d.Deliveries.DropOff))
	mux.Handle("POST /deliveries/{id}/decline", user(func(w http.ResponseWriter, r *http.Request) error {
		deliveryID, err := id(r, "id")
		if err != nil {
			return err
		}
		return reply(w, http.StatusNoContent, nil, d.Deliveries.Decline(r.Context(), identity.From(r), deliveryID))
	}))
	return mux
}
