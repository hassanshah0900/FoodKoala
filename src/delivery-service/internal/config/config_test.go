package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDefaults(t *testing.T) {
	c, err := Load(env(map[string]string{"DATABASE_URL": "postgres://u:p@db:5432/x"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8081" || c.KafkaGroupID != "delivery-service" || c.AssignEvery != 3*time.Second ||
		c.MaxPickupMeters != 5000 || c.LocationFreshFor != 5*time.Minute || c.KafkaBrokers != nil {
		t.Fatalf("unexpected defaults: %+v", c)
	}
}

func TestParsesValues(t *testing.T) {
	c, err := Load(env(map[string]string{
		"DATABASE_URL": "postgresql://u:p@db/x", "KAFKA_BROKERS": "kafka:29092, k2:9092",
		"MAX_PICKUP_KM": "2.5", "ASSIGN_EVERY": "1s",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.KafkaBrokers) != 2 || c.KafkaBrokers[1] != "k2:9092" || c.MaxPickupMeters != 2500 || c.AssignEvery != time.Second {
		t.Fatalf("unexpected: %+v", c)
	}
}

func TestListsEveryProblem(t *testing.T) {
	_, err := Load(env(map[string]string{"KAFKA_BROKERS": "kafka", "MAX_PICKUP_KM": "-1", "ASSIGN_EVERY": "soon"}))
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, key := range []string{"DATABASE_URL", "KAFKA_BROKERS", "MAX_PICKUP_KM", "ASSIGN_EVERY"} {
		if !strings.Contains(err.Error(), key) {
			t.Errorf("missing %s in %q", key, err)
		}
	}
}
