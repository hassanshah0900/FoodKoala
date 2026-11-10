package store

import (
	"context"
	"log/slog"
	"strings"
	"sync"

	"github.com/redis/go-redis/v9"
)

// Hub shares one Redis subscription among every WebSocket of this process:
// it subscribes to an order's channel while someone watches it, and hands
// each message to its watchers.
type Hub struct {
	ps       *redis.PubSub
	mu       sync.Mutex
	watchers map[string]map[*Watch]struct{}
}

// Watch receives an order's changes. Only the newest waits: a slow reader
// skips straight to the latest, which is all a map needs.
type Watch struct {
	C       <-chan []byte
	c       chan []byte
	orderID string
	hub     *Hub
}

func NewHub(ctx context.Context, rdb *redis.Client) *Hub {
	return &Hub{ps: rdb.Subscribe(ctx), watchers: map[string]map[*Watch]struct{}{}}
}

// Run hands out messages until ctx ends or the hub is closed.
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
	for {
		select {
		case w.c <- b:
			return
		default:
			select { // drop the one waiting; ours is newer
			case <-w.c:
			default:
			}
		}
	}
}

// Watch starts receiving an order's changes. Close it when done.
func (h *Hub) Watch(ctx context.Context, orderID string) (*Watch, error) {
	c := make(chan []byte, 1)
	w := &Watch{C: c, c: c, orderID: orderID, hub: h}
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

// Watching is how many orders this process is subscribed to, for tests.
func (h *Hub) Watching() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.watchers)
}

func (h *Hub) Close() error { return h.ps.Close() }
