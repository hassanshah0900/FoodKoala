// Package config reads tracking-service's settings from the environment, failing fast with every problem listed.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

type Config struct {
	Port     string
	RedisURL string
	// Unset: no events are consumed, so tracking never changes (fine locally without Kafka).
	KafkaBrokers []string
	KafkaGroupID string
}

var broker = regexp.MustCompile(`^[\w.-]+:\d+$`)

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
		Port:         str("PORT", "8082"),
		RedisURL:     str("REDIS_URL", ""),
		KafkaGroupID: str("KAFKA_GROUP_ID", "tracking-service"),
	}
	if u, err := url.Parse(c.RedisURL); c.RedisURL == "" || err != nil || (u.Scheme != "redis" && u.Scheme != "rediss") {
		problems = append(problems, "REDIS_URL: expected a redis:// URL")
	}
	for _, b := range strings.Split(getenv("KAFKA_BROKERS"), ",") {
		if b = strings.TrimSpace(b); b == "" {
			continue
		}
		if !broker.MatchString(b) {
			problems = append(problems, fmt.Sprintf("KAFKA_BROKERS: %q is not host:port", b))
		}
		c.KafkaBrokers = append(c.KafkaBrokers, b)
	}
	if len(problems) > 0 {
		return Config{}, errors.New("invalid configuration:\n  " + strings.Join(problems, "\n  "))
	}
	return c, nil
}
