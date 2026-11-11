// Package api serves chats over HTTP and WebSockets (contracts/openapi/chat-service.yaml).
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/httpx"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/live"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/service"
)

// Subprotocol is what clients offer and the server picks.
const Subprotocol = "foodkoala.chat.v1"

type Deps struct {
	Chats service.Service
	Hub   *live.Hub
	// Checked by /readyz: MongoDB, Redis, and photo storage when it is on.
	Ready func(ctx context.Context) error
	// Nil when no consumer runs (no Kafka); otherwise /readyz needs it alive.
	ConsumerAlive func() bool
	// How often a socket re-sends the chat if it changed unseen (Redis reconnecting), and pings.
	Resync, Ping time.Duration
}

var (
	uuidRe     = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	clientIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
)

func New(d Deps) http.Handler {
	if d.Resync == 0 {
		d.Resync = 30 * time.Second
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
		if err := d.Ready(ctx); err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "error": err.Error()})
			return
		}
		if d.ConsumerAlive != nil && !d.ConsumerAlive() {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "consumer": "stopped"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	route := func(pattern string, h httpx.Handler) { mux.Handle(pattern, identity.Require(h)) }
	route("GET /orders/{orderId}", d.view)
	route("POST /orders/{orderId}/messages", d.send)
	route("POST /orders/{orderId}/photos", d.sendPhoto)
	route("GET /orders/{orderId}/photos/{photoId}", d.photo)
	route("POST /orders/{orderId}/read", d.read)
	route("GET /orders/{orderId}/live", d.live)
	return mux
}

func orderID(r *http.Request) (string, error) {
	id := strings.ToLower(r.PathValue("orderId"))
	if !uuidRe.MatchString(id) {
		return "", httpx.Errorf(http.StatusBadRequest, "orderId must be a UUID")
	}
	return id, nil
}

func clientID(raw string) (string, error) {
	if !clientIDRe.MatchString(raw) {
		return "", httpx.Errorf(http.StatusBadRequest, "clientId must be 8 to 64 letters, digits, - or _")
	}
	return raw, nil
}

func (d Deps) view(w http.ResponseWriter, r *http.Request) error {
	id, err := orderID(r)
	if err != nil {
		return err
	}
	v, err := d.Chats.View(r.Context(), identity.From(r), id)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, v)
	return nil
}

// sent answers 201 for a new message and 200 for a retry that found the first one.
func sent(w http.ResponseWriter, m chat.Message, created bool) {
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	httpx.WriteJSON(w, status, m)
}

func (d Deps) send(w http.ResponseWriter, r *http.Request) error {
	id, err := orderID(r)
	if err != nil {
		return err
	}
	var body struct {
		ClientID string `json:"clientId"`
		Text     string `json:"text"`
	}
	if err := httpx.Decode(r, &body); err != nil {
		return err
	}
	cid, err := clientID(body.ClientID)
	if err != nil {
		return err
	}
	m, created, err := d.Chats.Send(r.Context(), identity.From(r), id, cid, body.Text)
	if err != nil {
		return err
	}
	sent(w, m, created)
	return nil
}

// sendPhoto takes multipart/form-data: `photo` (the file), `clientId`, and an optional `caption`.
func (d Deps) sendPhoto(w http.ResponseWriter, r *http.Request) error {
	id, err := orderID(r)
	if err != nil {
		return err
	}
	r.Body = http.MaxBytesReader(w, r.Body, chat.MaxPhotoBytes+64<<10)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return httpx.Errorf(http.StatusRequestEntityTooLarge, "Photos can be up to %d MB", chat.MaxPhotoBytes>>20)
		}
		return httpx.Errorf(http.StatusBadRequest, "Send the photo as multipart/form-data")
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()
	cid, err := clientID(r.FormValue("clientId"))
	if err != nil {
		return err
	}
	file, _, err := r.FormFile("photo")
	if err != nil {
		return httpx.Errorf(http.StatusBadRequest, "Attach the photo as the field `photo`")
	}
	defer file.Close()
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, io.LimitReader(file, chat.MaxPhotoBytes+1)); err != nil {
		return err
	}
	m, created, err := d.Chats.SendPhoto(r.Context(), identity.From(r), id, cid, r.FormValue("caption"), buf.Bytes())
	if err != nil {
		return err
	}
	sent(w, m, created)
	return nil
}

func (d Deps) photo(w http.ResponseWriter, r *http.Request) error {
	id, err := orderID(r)
	if err != nil {
		return err
	}
	photoID := strings.ToLower(r.PathValue("photoId"))
	if !uuidRe.MatchString(photoID) {
		return httpx.Errorf(http.StatusNotFound, "No such photo")
	}
	body, p, err := d.Chats.Photo(r.Context(), identity.From(r), id, photoID)
	if err != nil {
		return err
	}
	defer body.Close()
	w.Header().Set("Content-Type", p.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(p.Size, 10))
	// Private: only the people in the chat may see it, but it never changes.
	w.Header().Set("Cache-Control", "private, max-age=86400, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if _, err := io.Copy(w, body); err != nil {
		slog.Info("sending a photo stopped", "order", id, "err", err)
	}
	return nil
}

func (d Deps) read(w http.ResponseWriter, r *http.Request) error {
	id, err := orderID(r)
	if err != nil {
		return err
	}
	if err := d.Chats.Read(r.Context(), identity.From(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// live sends a snapshot of the chat, then every message and read receipt as it happens. The hub
// is joined before the snapshot is read, so nothing falls between them. "changed" (a new rider,
// the chat closing) and falling behind both send a fresh snapshot; so does the periodic resync
// when the chat changed without the socket hearing it (Redis drops messages while reconnecting).
func (d Deps) live(w http.ResponseWriter, r *http.Request) error {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return httpx.Errorf(http.StatusUpgradeRequired, "This is a WebSocket; connect with the %s subprotocol", Subprotocol)
	}
	id, err := orderID(r)
	if err != nil {
		return err
	}
	me := identity.From(r)
	watch, err := d.Hub.Watch(r.Context(), id)
	if err != nil {
		return err
	}
	defer watch.Close()
	if _, err := d.Chats.Visible(r.Context(), me, id); err != nil {
		return err
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols: []string{Subprotocol},
		// Callers prove who they are with a token, never a cookie, so any origin may connect.
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		return nil // Accept has answered the client already
	}
	defer conn.CloseNow()
	// Clients send through the HTTP API; reading in the background handles pings and closing.
	ctx := conn.CloseRead(r.Context())

	write := func(b []byte) error {
		wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		return conn.Write(wctx, websocket.MessageText, b)
	}
	var last []byte // the last snapshot sent, to resync only when something changed
	snapshot := func() error {
		v, err := d.Chats.View(ctx, me, id)
		if errors.Is(err, service.ErrNotFound) {
			// Handed to another rider: this one may no longer read along.
			_ = conn.Close(websocket.StatusPolicyViolation, "no longer in this chat")
			return errGone
		}
		if err != nil {
			return err
		}
		b, err := json.Marshal(chat.Event{Type: "snapshot", Chat: &v})
		if err != nil || bytes.Equal(b, last) {
			return err
		}
		last = b
		return write(b)
	}

	resync := time.NewTicker(d.Resync)
	defer resync.Stop()
	ping := time.NewTicker(d.Ping)
	defer ping.Stop()
	err = snapshot()
	for err == nil {
		select {
		case <-ctx.Done():
			return nil
		case b := <-watch.C:
			var e chat.Event
			if json.Unmarshal(b, &e) != nil {
				continue
			}
			if e.Type == "changed" {
				err = snapshot()
			} else {
				err = write(b)
			}
		case <-watch.Lagged:
			err = snapshot()
		case <-resync.C:
			err = snapshot()
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err = conn.Ping(pctx)
			cancel()
		}
	}
	if !errors.Is(err, errGone) && ctx.Err() == nil {
		slog.Info("chat socket ended", "order", id, "err", err)
	}
	return nil
}

var errGone = errors.New("no longer in the chat")
