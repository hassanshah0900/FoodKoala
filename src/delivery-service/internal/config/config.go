// Package config reads delivery-service's settings from the environment, failing fast with every problem listed.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string
	// Unset: order events are not consumed and the outbox is not published (fine locally without Kafka).
	KafkaBrokers []string
	KafkaGroupID string
	// How often waiting deliveries are matched with riders.
	AssignEvery time.Duration
	// The farthest a rider may be from the restaurant to be given the order.
	MaxPickupMeters float64
	// Riders whose last location is older than this are not given orders.
	LocationFreshFor time.Duration
	OutboxPollEvery  time.Duration
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
	dur := func(key string, def time.Duration) time.Duration {
		v := getenv(key)
		if v == "" {
			return def
		}
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			problems = append(problems, fmt.Sprintf("%s: expected a positive duration like 3s", key))
			return def
		}
		return d
	}

	c := Config{
		Port:             str("PORT", "8081"),
		DatabaseURL:      str("DATABASE_URL", ""),
		KafkaGroupID:     str("KAFKA_GROUP_ID", "delivery-service"),
		AssignEvery:      dur("ASSIGN_EVERY", 3*time.Second),
		LocationFreshFor: dur("LOCATION_FRESH_FOR", 5*time.Minute),
		OutboxPollEvery:  dur("OUTBOX_POLL_EVERY", 500*time.Millisecond),
		MaxPickupMeters:  5000,
	}
	if u, err := url.Parse(c.DatabaseURL); c.DatabaseURL == "" || err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		problems = append(problems, "DATABASE_URL: expected a postgres:// URL")
	}
	if v := getenv("MAX_PICKUP_KM"); v != "" {
		km, err := strconv.ParseFloat(v, 64)
		if err != nil || km <= 0 {
			problems = append(problems, "MAX_PICKUP_KM: expected a positive number")
		} else {
			c.MaxPickupMeters = km * 1000
		}
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
