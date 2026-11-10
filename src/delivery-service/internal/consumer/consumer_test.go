package consumer_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/consumer"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/deliveries"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/identity"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/inbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/outbox"
	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/testdb"
)

func event(typ string, data map[string]any) []byte {
	b, _ := json.Marshal(map[string]any{"id": outbox.NewID(), "type": typ, "version": 1, "data": data})
	return b
}

// Against a real broker: KAFKA_BROKERS=localhost:9092 go test ./...
func TestConsumesOrderEventsInAnyOrder(t *testing.T) {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		t.Skip("needs KAFKA_BROKERS")
	}
	pool := testdb.Open(t)
	svc := deliveries.Service{DB: pool, MaxPickupMeters: 5000, LocationFreshFor: 5 * time.Minute}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Topics of this run only, so older runs never replay into this one.
	run := outbox.NewID()[:8]
	placedTopic, changedTopic := "test."+run+".order.placed", "test."+run+".order.status_changed"
	producer, err := kgo.NewClient(kgo.SeedBrokers(strings.Split(brokers, ",")...), kgo.AllowAutoTopicCreation())
	if err != nil {
		t.Fatal(err)
	}
	defer producer.Close()

	orderID := outbox.NewID()
	accepted := event("order.status_changed", map[string]any{"orderId": orderID, "to": "accepted", "by": "restaurant", "at": time.Now().Format(time.RFC3339Nano)})
	placed := event("order.placed", map[string]any{
		"orderId": orderID, "customerId": outbox.NewID(), "customerPhone": "+923001112233", "restaurantId": outbox.NewID(),
		"restaurantName": "Karachi Broast", "restaurantLocation": map[string]any{"lat": 24.92, "lng": 67.09},
		"totals": map[string]any{"deliveryFeePaisa": 9900, "totalPaisa": 99900}, "paymentMethod": "cod",
		"deliveryAddress": map[string]any{"lat": 24.93, "lng": 67.1, "text": "House 7"},
	})
	// The status change goes out first, and a junk record sits in front of it.
	if err := producer.ProduceSync(ctx,
		&kgo.Record{Topic: changedTopic, Key: []byte(orderID), Value: []byte("junk")},
		&kgo.Record{Topic: changedTopic, Key: []byte(orderID), Value: accepted},
	).FirstErr(); err != nil {
		t.Fatal(err)
	}

	c, err := consumer.New(strings.Split(brokers, ","), "test-"+run, []string{placedTopic, changedTopic}, inbox.Inbox{DB: pool, Handlers: svc.Handlers()}.Apply)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Client.Close()
	c.Retry = 200 * time.Millisecond
	go c.Run(ctx)

	time.Sleep(2 * time.Second) // the status change waits for its order
	if err := producer.ProduceSync(ctx, &kgo.Record{Topic: placedTopic, Key: []byte(orderID), Value: placed}).FirstErr(); err != nil {
		t.Fatal(err)
	}
	admin := identity.Identity{Roles: []string{"admin"}}
	for {
		d, err := svc.ForOrder(ctx, admin, orderID)
		if err == nil && d.Status == "searching" {
			break
		}
		if ctx.Err() != nil {
			t.Fatalf("delivery never started searching (last: %+v, %v)", d, err)
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !c.Alive() {
		t.Fatal("consumer stopped")
	}
}
