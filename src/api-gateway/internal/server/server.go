// Package server wires the gateway's HTTP routes.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/hassanshah0900/FoodKoala/src/api-gateway/internal/auth"
)

// Upstreams maps a public route prefix (/api/v1/<name>/) to a backend service.
// Each URL is read from <NAME>_SERVICE_URL, e.g. ORDER_SERVICE_URL.
var Upstreams = map[string]string{
	"auth":          "http://auth-service:3001",
	"users":         "http://user-service:3002",
	"restaurants":   "http://restaurant-service:3003",
	"menus":         "http://menu-service:3004",
	"cart":          "http://cart-service:3005",
	"orders":        "http://order-service:3006",
	"notifications": "http://notification-service:3007",
	"delivery":      "http://delivery-service:8081",
	"tracking":      "http://tracking-service:8082",
	"chat":          "http://chat-service:8083",
	"payments":      "http://payment-service:8001",
	"search":        "http://search-service:8002",
}

var envNames = map[string]string{
	"auth": "AUTH", "users": "USER", "restaurants": "RESTAURANT", "menus": "MENU",
	"cart": "CART", "orders": "ORDER", "notifications": "NOTIFICATION",
	"delivery": "DELIVERY", "tracking": "TRACKING", "chat": "CHAT", "payments": "PAYMENT", "search": "SEARCH",
}

// DefaultUpstreamTimeout is how long a service may take to start answering.
const DefaultUpstreamTimeout = 30 * time.Second

type Config struct {
	Port      string
	Upstreams map[string]*url.URL
	// UpstreamTimeout limits the wait for a service's response headers, from
	// when the request (body included) has been sent; past it the caller gets
	// 504. Once the headers arrive nothing is timed, so a WebSocket (101) or a
	// long download stays open. Zero means DefaultUpstreamTimeout.
	UpstreamTimeout time.Duration
	// Verifier checks access tokens; LoadConfig builds one backed by the auth-service JWKS.
	Verifier auth.TokenVerifier
	// Ready is /readyz: nil once tokens can be checked. Nil means always ready.
	Ready func(ctx context.Context) error
}

func LoadConfig() Config {
	cfg := Config{Port: getenv("PORT", "8080"), Upstreams: map[string]*url.URL{}}
	if raw := os.Getenv("UPSTREAM_TIMEOUT"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil || d <= 0 {
			slog.Error("invalid UPSTREAM_TIMEOUT, expected a positive duration like 30s", "value", raw)
			os.Exit(1)
		}
		cfg.UpstreamTimeout = d
	}
	for name, def := range Upstreams {
		raw := getenv(envNames[name]+"_SERVICE_URL", def)
		u, err := url.Parse(raw)
		if err != nil {
			slog.Error("invalid upstream url", "name", name, "url", raw, "err", err)
			os.Exit(1)
		}
		cfg.Upstreams[name] = u
	}

	jwks := auth.NewJWKS(getenv("AUTH_JWKS_URL", cfg.Upstreams["auth"].JoinPath(".well-known", "jwks.json").String()))
	cfg.Ready = jwks.Ready
	cfg.Verifier = &auth.Verifier{
		Keys:     jwks,
		Issuer:   getenv("JWT_ISSUER", "foodkoala-auth"),
		Audience: getenv("JWT_AUDIENCE", "foodkoala"),
		Leeway:   30 * time.Second,
	}
	return cfg
}

// New returns the gateway handler: health checks plus /api/v1/<service>/... proxying.
// The prefix is stripped, so /api/v1/orders/123 reaches order-service as /123.
// Requests are authenticated first (auth.DefaultPolicy, ADR 0005).
func New(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", ok)
	mux.HandleFunc("GET /readyz", readiness(cfg.Ready))

	timeout := cfg.UpstreamTimeout
	if timeout == 0 {
		timeout = DefaultUpstreamTimeout
	}
	// One transport, so every route shares its pool of upstream connections.
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = timeout

	for name, target := range cfg.Upstreams {
		prefix := "/api/v1/" + name
		proxy := &httputil.ReverseProxy{
			Transport: transport,
			Rewrite: func(r *httputil.ProxyRequest) {
				r.SetURL(target)
				r.SetXForwarded()
				r.Out.URL.Path = "/" + strings.TrimPrefix(strings.TrimPrefix(r.In.URL.Path, prefix), "/")
				r.Out.URL.RawPath = ""
			},
			ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
				slog.Warn("upstream error", "upstream", name, "err", err)
				if isTimeout(err) {
					writeJSON(w, http.StatusGatewayTimeout, map[string]string{"error": "upstream timed out"})
					return
				}
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream unavailable"})
			},
		}
		mux.Handle(prefix+"/", proxy)
		mux.Handle(prefix, proxy)
	}
	// TODO(api-gateway): rate limiting middleware.
	return auth.Middleware(cfg.Verifier, auth.DefaultPolicy, mux)
}

// isTimeout is true when the service didn't answer in time (or couldn't be
// reached in time), as opposed to refusing or dropping the connection.
func isTimeout(err error) bool {
	var ne net.Error
	return errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &ne) && ne.Timeout())
}

func ok(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readiness answers 503 until auth-service's signing keys are in hand. It
// doesn't check the upstream services: one of them being down shouldn't take
// the whole gateway out of rotation, and that route already answers 502.
func readiness(ready func(ctx context.Context) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ready != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := ready(ctx); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "jwks": err.Error()})
				return
			}
		}
		ok(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
