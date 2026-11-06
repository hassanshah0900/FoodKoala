package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestHealth(t *testing.T) {
	h := New(Config{Upstreams: map[string]*url.URL{}})
	for _, p := range []string{"/healthz", "/readyz"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: got %d", p, rec.Code)
		}
	}
}

func TestProxyStripsPrefix(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, r.URL.Path)
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)

	gw := httptest.NewServer(New(Config{Upstreams: map[string]*url.URL{"orders": target}}))
	defer gw.Close()

	res, err := http.Get(gw.URL + "/api/v1/orders/123")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "/123" {
		t.Fatalf("upstream saw %q, want /123", body)
	}
}

func TestUnknownUpstreamIs502(t *testing.T) {
	dead, _ := url.Parse("http://127.0.0.1:1")
	gw := httptest.NewServer(New(Config{Upstreams: map[string]*url.URL{"orders": dead}}))
	defer gw.Close()
	res, err := http.Get(gw.URL + "/api/v1/orders")
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("got %d, want 502", res.StatusCode)
	}
}
