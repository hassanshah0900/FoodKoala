package server

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/hassanshah0900/FoodKoala/src/api-gateway/internal/auth"
)

// anyone accepts every token; nobody rejects all.
type anyone struct{}

func (anyone) Verify(context.Context, string) (*auth.Claims, error) {
	return &auth.Claims{Subject: "user-1", Roles: []string{"customer"}}, nil
}

type nobody struct{}

func (nobody) Verify(context.Context, string) (*auth.Claims, error) { return nil, auth.ErrInvalidToken }

// get sends an authenticated GET, since /orders is a protected route.
func get(url string) (*http.Response, error) {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer t")
	return http.DefaultClient.Do(req)
}

func TestHealth(t *testing.T) {
	h := New(Config{Upstreams: map[string]*url.URL{}, Verifier: nobody{}})
	for _, p := range []string{"/healthz", "/readyz"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: got %d", p, rec.Code)
		}
	}
}

func TestReadyzWaitsForSigningKeys(t *testing.T) {
	var keysErr error = errors.New("jwks: no signing keys yet")
	h := New(Config{Upstreams: map[string]*url.URL{}, Verifier: nobody{}, Ready: func(context.Context) error { return keysErr }})
	check := func(want int) {
		t.Helper()
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
		if rec.Code != want {
			t.Fatalf("got %d, want %d", rec.Code, want)
		}
	}
	check(http.StatusServiceUnavailable)
	keysErr = nil
	check(http.StatusOK)
}

func TestProxyStripsPrefix(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, r.URL.Path)
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)

	gw := httptest.NewServer(New(Config{Upstreams: map[string]*url.URL{"orders": target}, Verifier: anyone{}}))
	defer gw.Close()

	res, err := get(gw.URL + "/api/v1/orders/123")
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
	gw := httptest.NewServer(New(Config{Upstreams: map[string]*url.URL{"orders": dead}, Verifier: anyone{}}))
	defer gw.Close()
	res, err := get(gw.URL + "/api/v1/orders")
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("got %d, want 502", res.StatusCode)
	}
}

func TestRoutesAreAuthenticated(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, r.Header.Get(auth.HeaderUserID))
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	ups := map[string]*url.URL{"orders": target}

	anon := httptest.NewServer(New(Config{Upstreams: ups, Verifier: nobody{}}))
	defer anon.Close()
	res, err := http.Get(anon.URL + "/api/v1/orders")
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous /orders: got %d, want 401", res.StatusCode)
	}

	authed := httptest.NewServer(New(Config{Upstreams: ups, Verifier: anyone{}}))
	defer authed.Close()
	res, err = get(authed.URL + "/api/v1/orders")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "user-1" {
		t.Fatalf("upstream saw X-User-Id %q, want user-1", body)
	}
}

func TestLoadConfigDerivesJWKSURLFromAuthUpstream(t *testing.T) {
	t.Setenv("AUTH_SERVICE_URL", "http://auth.internal:3001")
	v := LoadConfig().Verifier.(*auth.Verifier)
	if got := v.Keys.(*auth.JWKS).URL; got != "http://auth.internal:3001/.well-known/jwks.json" {
		t.Fatalf("jwks url = %q", got)
	}
	if v.Issuer != "foodkoala-auth" || v.Audience != "foodkoala" {
		t.Fatalf("issuer/audience = %q/%q", v.Issuer, v.Audience)
	}
}
