// chat-service: the customer and the rider of an order talk, with text and photos, live.
//
//	server               run the API, the WebSockets and the event consumer
//	server healthcheck   exit 0 if this container's /readyz answers 200 (the image has no curl)
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/api"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/chat"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/config"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/consumer"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/live"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/outbox"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/photos"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/service"
	"github.com/hassanshah0900/FoodKoala/src/chat-service/internal/store"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", "chat-service"))
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		slog.Error("chat-service failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	mc, err := mongo.Connect(options.Client().ApplyURI(cfg.MongoURL))
	if err != nil {
		return err
	}
	defer func() { _ = mc.Disconnect(context.Background()) }()
	st := store.Store{DB: mc.Database(cfg.MongoDB)}
	startCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := st.Migrate(startCtx); err != nil {
		return err
	}

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	rdb := redis.NewClient(opts)
	defer rdb.Close()

	svc := service.Service{Repo: st, Live: live.Publisher{Redis: rdb}}
	checks := []func(context.Context) error{st.Ping, func(ctx context.Context) error { return rdb.Ping(ctx).Err() }}
	if cfg.S3Endpoint != "" {
		ph, err := photos.New(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3UseSSL)
		if err != nil {
			return err
		}
		// The storage may still be starting next to us (compose): keep trying until startCtx ends.
		if err := retry(startCtx, ph.EnsureBucket); err != nil {
			return err
		}
		svc.Photos = ph
		checks = append(checks, ph.Ping)
	} else {
		slog.Warn("S3_ENDPOINT is not set: photos are turned off")
	}

	hub := live.NewHub(ctx, rdb)
	defer hub.Close()
	deps := api.Deps{Chats: svc, Hub: hub, Ready: func(ctx context.Context) error {
		for _, check := range checks {
			if err := check(ctx); err != nil {
				return err
			}
		}
		return nil
	}}

	var workers sync.WaitGroup
	start := func(f func()) { workers.Add(1); go func() { defer workers.Done(); f() }() }
	start(func() { hub.Run(ctx) })
	if len(cfg.KafkaBrokers) > 0 {
		c, err := consumer.New(cfg.KafkaBrokers, cfg.KafkaGroupID, chat.Topics, consumer.Decode(svc.Apply))
		if err != nil {
			return err
		}
		defer c.Client.Close()
		deps.ConsumerAlive = c.Alive
		start(func() { c.Run(ctx) })

		// Telling people about messages waiting for them: found every 15 s, sent through the outbox.
		producer, err := kgo.NewClient(kgo.SeedBrokers(cfg.KafkaBrokers...), kgo.AllowAutoTopicCreation())
		if err != nil {
			return err
		}
		defer producer.Close()
		relay := outbox.Relay{Store: st, Publisher: outbox.KafkaPublisher{Client: producer}, Batch: 100, Every: time.Second}
		start(func() { relay.Run(ctx) })
		start(func() { svc.RunNudges(ctx, 15*time.Second) })
	} else {
		slog.Warn("KAFKA_BROKERS is not set: no events are consumed, so no chat ever opens")
	}

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: api.New(deps), ReadHeaderTimeout: 5 * time.Second}
	errs := make(chan error, 1)
	go func() {
		slog.Info("listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errs <- err
		}
	}()
	select {
	case err := <-errs:
		stop()
		workers.Wait()
		return err
	case <-ctx.Done():
	}
	slog.Info("shutting down")
	// Shutdown doesn't wait for hijacked connections; the sockets end with ctx.
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	_ = srv.Shutdown(shutdownCtx)
	workers.Wait()
	return nil
}

// retry runs f every second until it succeeds or ctx ends, returning its last error then.
func retry(ctx context.Context, f func(context.Context) error) error {
	for {
		err := f(ctx)
		if err == nil {
			return nil
		}
		slog.Warn("not ready yet, retrying", "err", err)
		select {
		case <-ctx.Done():
			return err
		case <-time.After(time.Second):
		}
	}
}

func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}
	client := http.Client{Timeout: 2 * time.Second}
	res, err := client.Get("http://127.0.0.1:" + port + "/readyz")
	if err != nil {
		return 1
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
