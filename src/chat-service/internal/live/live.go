// Package live passes chat events between replicas over Redis pub/sub, so a message sent
// through any replica reaches the sockets of both sides, wherever they are connected.
package live

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"

	"github.com/redis/go-redis/v9"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
)

// Channel is where an order's chat events are published.
func Channel(orderID string) string { return "chat:live:" + orderID }

// Publisher announces chat events.
type Publisher struct{ Redis *redis.Client }

func (p Publisher) Announce(ctx context.Context, orderID string, e chat.Event) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return p.Redis.Publish(ctx, Channel(orderID), b).Err()
}

// Backlog is how many events a socket may fall behind before it is told to catch up from a snapshot.
const Backlog = 32

// Hub shares one Redis subscription among every socket of this process: it subscribes to a
// chat's channel while someone watches it, and hands each event to its watchers.
type Hub struct {
	ps       *redis.PubSub
	mu       sync.Mutex
	watchers map[string]map[*Watch]struct{}
}

// Watch receives a chat's events in order. Unlike a map position, no message may be skipped: a
// reader that falls Backlog behind gets a signal on Lagged instead, and sends a snapshot.
type Watch struct {
	C       <-chan []byte
	Lagged  <-chan struct{}
	c       chan []byte
	lagged  chan struct{}
	orderID string
	hub     *Hub
}

func NewHub(ctx context.Context, rdb *redis.Client) *Hub {
	return &Hub{ps: rdb.Subscribe(ctx), watchers: map[string]map[*Watch]struct{}{}}
}

// Run hands out events until ctx ends or the hub is closed.
func (h *Hub) Run(ctx context.Context) {
	ch := h.ps.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			orderID := strings.TrimPrefix(msg.Channel, Channel(""))
			h.mu.Lock()
			for w := range h.watchers[orderID] {
				w.offer([]byte(msg.Payload))
			}
			h.mu.Unlock()
		}
	}
}

func (w *Watch) offer(b []byte) {
	select {
	case w.c <- b:
	default:
		select {
		case w.lagged <- struct{}{}:
		default: // already told
		}
	}
}

// Watch starts receiving a chat's events. Close it when done.
func (h *Hub) Watch(ctx context.Context, orderID string) (*Watch, error) {
	c, lagged := make(chan []byte, Backlog), make(chan struct{}, 1)
	w := &Watch{C: c, Lagged: lagged, c: c, lagged: lagged, orderID: orderID, hub: h}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.watchers[orderID] == nil {
		if err := h.ps.Subscribe(ctx, Channel(orderID)); err != nil {
			return nil, err
		}
		h.watchers[orderID] = map[*Watch]struct{}{}
	}
	h.watchers[orderID][w] = struct{}{}
	return w, nil
}

func (w *Watch) Close() {
	h := w.hub
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.watchers[w.orderID]
	if _, ok := set[w]; !ok {
		return
	}
	delete(set, w)
	if len(set) == 0 {
		delete(h.watchers, w.orderID)
		if err := h.ps.Unsubscribe(context.Background(), Channel(w.orderID)); err != nil {
			slog.Warn("unsubscribing failed", "order", w.orderID, "err", err)
		}
	}
}

// Watching is how many chats this process is subscribed to, for tests.
func (h *Hub) Watching() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.watchers)
}

func (h *Hub) Close() error { return h.ps.Close() }
