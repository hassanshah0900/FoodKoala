package consumer_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/consumer"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/store"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/testredis"
	"github.com/hassanshah0900/FoodKoala/src/tracking-service/internal/tracking"
)

func event(typ string, data map[string]any) []byte {
	b, _ := json.Marshal(map[string]any{"id": testredis.NewID(), "type": typ, "version": 1, "data": data})
	return b
}

func TestDecodeRejectsWhatIsNotAnEnvelope(t *testing.T) {
	apply := consumer.Decode(func(context.Context, tracking.Envelope) error { return nil })
	for _, raw := range []string{"junk", `{"id":"x"}`, `[]`} {
		if err := apply(context.Background(), []byte(raw)); !errors.Is(err, tracking.ErrMalformed) {
			t.Errorf("%s: %v", raw, err)
		}
	}
}

// Against a real broker: KAFKA_BROKERS=localhost:9092 REDIS_URL=redis://localhost:6379 go test ./...
func TestConsumesEventsFromEveryTopicIntoTheStore(t *testing.T) {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		t.Skip("needs KAFKA_BROKERS")
	}
	rdb := testredis.Open(t)
	st := store.Store{Redis: rdb}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Topics of this run only, so older runs never replay into this one.
	run := testredis.NewID()[:8]
	placedTopic, locationTopic := "test."+run+".order.placed", "test."+run+".rider.location"
	producer, err := kgo.NewClient(kgo.SeedBrokers(strings.Split(brokers, ",")...), kgo.AllowAutoTopicCreation())
	if err != nil {
		t.Fatal(err)
	}
	defer producer.Close()

	orderID, customerID, riderID := testredis.NewID(), testredis.NewID(), testredis.NewID()
	location := event("rider.location", map[string]any{"orderId": orderID, "deliveryId": testredis.NewID(), "riderId": riderID,
		"location": map[string]float64{"lat": 24.925, "lng": 67.095}, "at": time.Now()})
	placed := event("order.placed", map[string]any{"orderId": orderID, "customerId": customerID,
		"restaurantLocation": map[string]float64{"lat": 24.92, "lng": 67.09},
		"deliveryAddress":    map[string]any{"lat": 24.935, "lng": 67.105, "text": "House 7"}})
	// A junk record in front must be skipped, not block the partition.
	if err := producer.ProduceSync(ctx,
		&kgo.Record{Topic: locationTopic, Key: []byte(orderID), Value: []byte("junk")},
		&kgo.Record{Topic: locationTopic, Key: []byte(orderID), Value: location},
		&kgo.Record{Topic: placedTopic, Key: []byte(orderID), Value: placed},
	).FirstErr(); err != nil {
		t.Fatal(err)
	}

	c, err := consumer.New(strings.Split(brokers, ","), "test-"+run, []string{placedTopic, locationTopic}, consumer.Decode(st.Apply))
	if err != nil {
		t.Fatal(err)
	}
	defer c.Client.Close()
	go c.Run(ctx)

	for {
		s, err := st.Get(ctx, orderID)
		if err == nil && s != nil && s.CustomerID == customerID && s.RiderLocation != nil && s.ETA != nil {
			break
		}
		if ctx.Err() != nil {
			t.Fatalf("tracking never filled in (last: %+v, %v)", s, err)
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !c.Alive() {
		t.Fatal("consumer stopped")
	}
}
