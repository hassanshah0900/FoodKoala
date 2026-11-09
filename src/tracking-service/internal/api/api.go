// Package api serves tracking over HTTP and WebSockets (contracts/openapi/tracking-service.yaml).
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/store"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/tracking"
)

// Subprotocol is what clients offer and the server picks.
const Subprotocol = "foodkoala.tracking.v1"

type Deps struct {
	Store store.Store
	Hub   *store.Hub
	// Nil when no consumer runs (no Kafka); otherwise /readyz needs it alive.
	ConsumerAlive func() bool
	// How often a socket re-reads the tracking in case a message was missed, and pings.
	Resync, Ping time.Duration
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func New(d Deps) http.Handler {
	if d.Resync == 0 {
		d.Resync = 10 * time.Second
	}
	if d.Ping == 0 {
		d.Ping = 30 * time.Second
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := d.Store.Redis.Ping(ctx).Err(); err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "redis": err.Error()})
			return
		}
		if d.ConsumerAlive != nil && !d.ConsumerAlive() {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "consumer": "stopped"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.Handle("GET /orders/{orderId}", identity.Require(httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		st, err := d.visible(r)
		if err != nil {
			return err
		}
		httpx.WriteJSON(w, http.StatusOK, st.View)
		return nil
	})))
	mux.Handle("GET /orders/{orderId}/live", identity.Require(httpx.Handler(d.live)))
	return mux
}

var errNotFound = httpx.Errorf(http.StatusNotFound, "No tracking for this order")

// visible is the order's tracking if the caller may see it; 404 otherwise, as if it didn't exist.
func (d Deps) visible(r *http.Request) (*tracking.State, error) {
	orderID := strings.ToLower(r.PathValue("orderId"))
	if !uuidRe.MatchString(orderID) {
		return nil, httpx.Errorf(http.StatusBadRequest, "orderId must be a UUID")
	}
	st, err := d.Store.Get(r.Context(), orderID)
	if err != nil {
		return nil, err
	}
	me := identity.From(r)
	if st == nil || !st.CanSee(me.UserID, me.IsAdmin()) {
		return nil, errNotFound
	}
	return st, nil
}

// live sends the tracking now and on every change. The hub is joined before the
// first read. Redis may confirm that subscription a moment after the read, and
// drops messages while reconnecting, so a periodic re-read covers both gaps.
func (d Deps) live(w http.ResponseWriter, r *http.Request) error {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return httpx.Errorf(http.StatusUpgradeRequired, "This is a WebSocket; connect with the %s subprotocol", Subprotocol)
	}
	orderID := strings.ToLower(r.PathValue("orderId"))
	if !uuidRe.MatchString(orderID) {
		return httpx.Errorf(http.StatusBadRequest, "orderId must be a UUID")
	}
	watch, err := d.Hub.Watch(r.Context(), orderID)
	if err != nil {
		return err
	}
	defer watch.Close()
	st, err := d.visible(r)
	if err != nil {
		return err
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols: []string{Subprotocol},
		// Callers prove who they are with a token, never a cookie, so another
		// site's page can't ride on someone's session: any origin may connect.
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		return nil // Accept has answered the client already
	}
	defer conn.CloseNow()
	// We never expect messages; reading in the background handles pings and the client closing.
	ctx := conn.CloseRead(r.Context())

	sent := 0
	send := func(v tracking.View) error {
		if v.Version <= sent {
			return nil
		}
		b, err := json.Marshal(v)
		if err != nil {
			return err
		}
		wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		if err := conn.Write(wctx, websocket.MessageText, b); err != nil {
			return err
		}
		sent = v.Version
		if v.Status == tracking.Delivered || v.Status == tracking.Cancelled {
			_ = conn.Close(websocket.StatusNormalClosure, "finished")
			return errDone
		}
		return nil
	}

	resync := time.NewTicker(d.Resync)
	defer resync.Stop()
	ping := time.NewTicker(d.Ping)
	defer ping.Stop()
	err = send(st.View)
	for err == nil {
		select {
		case <-ctx.Done():
			return nil
		case b := <-watch.C:
			var v tracking.View
			if json.Unmarshal(b, &v) == nil {
				err = send(v)
			}
		case <-resync.C:
			var fresh *tracking.State
			if fresh, err = d.Store.Get(ctx, orderID); err == nil && fresh != nil {
				err = send(fresh.View)
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err = conn.Ping(pctx)
			cancel()
		}
	}
	if !errors.Is(err, errDone) && ctx.Err() == nil {
		slog.Info("tracking socket ended", "order", orderID, "err", err)
	}
	return nil
}

var errDone = errors.New("finished")
