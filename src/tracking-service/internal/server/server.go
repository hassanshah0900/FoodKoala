// Package server wires the HTTP routes of tracking-service.
package server

import (
	"encoding/json"
	"net/http"
	"os"
)

type Config struct {
	Port string
}

func LoadConfig() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}
	return Config{Port: port}
}

// New returns the service's HTTP handler.
func New(_ Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", ok)
	mux.HandleFunc("GET /readyz", ok)
	// TODO(tracking-service): WebSocket stream of rider locations and ETA calculation.
	return mux
}

func ok(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
