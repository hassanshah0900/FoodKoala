// Package config reads chat-service's settings from the environment, failing fast with every problem listed.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

type Config struct {
	Port string
	// Chats and messages.
	MongoURL string
	MongoDB  string
	// Live messages between replicas.
	RedisURL string
	// Unset: no events are consumed, so no chat ever opens (fine locally without Kafka).
	KafkaBrokers []string
	KafkaGroupID string
	// Where photos are kept (S3 or MinIO). S3Endpoint unset: photos are turned off.
	S3Endpoint  string
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	S3UseSSL    bool
}

var hostPort = regexp.MustCompile(`^[\w.-]+:\d+$`)

// Load reads the configuration through getenv (os.Getenv in main, a map in tests).
func Load(getenv func(string) string) (Config, error) {
	var problems []string
	str := func(key, def string) string {
		if v := strings.TrimSpace(getenv(key)); v != "" {
			return v
		}
		return def
	}
	c := Config{
		Port:         str("PORT", "8083"),
		MongoURL:     str("MONGO_URL", ""),
		MongoDB:      str("MONGO_DB", "chat"),
		RedisURL:     str("REDIS_URL", ""),
		KafkaGroupID: str("KAFKA_GROUP_ID", "chat-service"),
		S3Endpoint:   str("S3_ENDPOINT", ""),
		S3AccessKey:  str("S3_ACCESS_KEY", ""),
		S3SecretKey:  str("S3_SECRET_KEY", ""),
		S3Bucket:     str("S3_BUCKET", "chat-photos"),
		S3UseSSL:     str("S3_USE_SSL", "false") == "true",
	}
	if u, err := url.Parse(c.MongoURL); c.MongoURL == "" || err != nil || (u.Scheme != "mongodb" && u.Scheme != "mongodb+srv") {
		problems = append(problems, "MONGO_URL: expected a mongodb:// URL")
	}
	if u, err := url.Parse(c.RedisURL); c.RedisURL == "" || err != nil || (u.Scheme != "redis" && u.Scheme != "rediss") {
		problems = append(problems, "REDIS_URL: expected a redis:// URL")
	}
	for _, b := range strings.Split(getenv("KAFKA_BROKERS"), ",") {
		if b = strings.TrimSpace(b); b == "" {
			continue
		}
		if !hostPort.MatchString(b) {
			problems = append(problems, fmt.Sprintf("KAFKA_BROKERS: %q is not host:port", b))
		}
		c.KafkaBrokers = append(c.KafkaBrokers, b)
	}
	if c.S3Endpoint != "" {
		if !hostPort.MatchString(c.S3Endpoint) {
			problems = append(problems, "S3_ENDPOINT: expected host:port, e.g. minio:9000")
		}
		if c.S3AccessKey == "" || c.S3SecretKey == "" {
			problems = append(problems, "S3_ACCESS_KEY and S3_SECRET_KEY are needed with S3_ENDPOINT")
		}
	}
	if len(problems) > 0 {
		return Config{}, errors.New("invalid configuration:\n  " + strings.Join(problems, "\n  "))
	}
	return c, nil
}
