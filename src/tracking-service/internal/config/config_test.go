package config

import (
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDefaults(t *testing.T) {
	c, err := Load(env(map[string]string{"REDIS_URL": "redis://redis:6379"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8082" || c.KafkaGroupID != "tracking-service" || c.KafkaBrokers != nil {
		t.Fatalf("%+v", c)
	}
}

func TestBrokers(t *testing.T) {
	c, err := Load(env(map[string]string{"REDIS_URL": "redis://r:6379/1", "KAFKA_BROKERS": "kafka:29092, k2:9092"}))
	if err != nil || len(c.KafkaBrokers) != 2 || c.KafkaBrokers[1] != "k2:9092" {
		t.Fatalf("%+v %v", c, err)
	}
}

func TestEveryProblemIsListed(t *testing.T) {
	_, err := Load(env(map[string]string{"REDIS_URL": "http://x", "KAFKA_BROKERS": "kafka"}))
	if err == nil || !strings.Contains(err.Error(), "REDIS_URL") || !strings.Contains(err.Error(), `"kafka" is not host:port`) {
		t.Fatalf("err: %v", err)
	}
}
