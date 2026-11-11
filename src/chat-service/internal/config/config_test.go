package config

import (
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestLoadDefaults(t *testing.T) {
	c, err := Load(env(map[string]string{"MONGO_URL": "mongodb://localhost:27017", "REDIS_URL": "redis://localhost:6379"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8083" || c.MongoDB != "chat" || c.KafkaGroupID != "chat-service" || c.S3Bucket != "chat-photos" {
		t.Fatalf("got %+v", c)
	}
	if c.S3Endpoint != "" || len(c.KafkaBrokers) != 0 {
		t.Fatal("photos and events are off unless configured")
	}
}

func TestLoadListsEveryProblem(t *testing.T) {
	_, err := Load(env(map[string]string{
		"MONGO_URL": "postgres://x", "KAFKA_BROKERS": "kafka", "S3_ENDPOINT": "minio:9000",
	}))
	if err == nil {
		t.Fatal("want an error")
	}
	for _, want := range []string{"MONGO_URL", "REDIS_URL", "KAFKA_BROKERS", "S3_ACCESS_KEY"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("missing %s in %q", want, err)
		}
	}
}

func TestLoadPhotos(t *testing.T) {
	c, err := Load(env(map[string]string{
		"MONGO_URL": "mongodb://mongo:27017", "REDIS_URL": "redis://redis:6379",
		"S3_ENDPOINT": "minio:9000", "S3_ACCESS_KEY": "k", "S3_SECRET_KEY": "s", "S3_USE_SSL": "true",
	}))
	if err != nil || !c.S3UseSSL || c.S3Endpoint != "minio:9000" {
		t.Fatalf("got %+v, %v", c, err)
	}
}
