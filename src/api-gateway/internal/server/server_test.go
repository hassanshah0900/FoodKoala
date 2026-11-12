package server

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

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
	keysErr := errors.New("jwks: no signing keys yet")
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

// gateway proxies /api/v1/orders to handler, with a short upstream timeout.
func gateway(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	upstream := httptest.NewServer(handler)
	t.Cleanup(upstream.Close)
	target, _ := url.Parse(upstream.URL)
	gw := httptest.NewServer(New(Config{
		Upstreams:       map[string]*url.URL{"orders": target},
		Verifier:        anyone{},
		UpstreamTimeout: 100 * time.Millisecond,
	}))
	t.Cleanup(gw.Close)
	return gw
}

func TestHungUpstreamIs504(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	gw := gateway(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	})

	start := time.Now()
	res, err := get(gw.URL + "/api/v1/orders")
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusGatewayTimeout {
		t.Fatalf("got %d, want 504", res.StatusCode)
	}
	if waited := time.Since(start); waited > 2*time.Second {
		t.Fatalf("answered after %s, want about the 100ms timeout", waited)
	}
}

func TestTimeoutIsOnlyUntilTheHeaders(t *testing.T) {
	// Headers at once, then a body that takes longer than the timeout.
	gw := gateway(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		time.Sleep(300 * time.Millisecond)
		_, _ = io.WriteString(w, "done")
	})
	res, err := get(gw.URL + "/api/v1/orders")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK || string(body) != "done" {
		t.Fatalf("got %d %q, want 200 \"done\"", res.StatusCode, body)
	}
}

func TestSlowUploadIsNotTimedOut(t *testing.T) {
	// The clock starts once the request body has been sent, so a slow upload is fine.
	gw := gateway(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_, _ = w.Write(body)
	})
	pr, pw := io.Pipe()
	go func() {
		_, _ = io.WriteString(pw, "photo")
		time.Sleep(300 * time.Millisecond)
		_, _ = io.WriteString(pw, " bytes")
		_ = pw.Close()
	}()
	req, _ := http.NewRequest(http.MethodPost, gw.URL+"/api/v1/orders", pr)
	req.Header.Set("Authorization", "Bearer t")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK || string(body) != "photo bytes" {
		t.Fatalf("got %d %q, want 200 \"photo bytes\"", res.StatusCode, body)
	}
}

func TestWebSocketOutlivesTheTimeout(t *testing.T) {
	// The upstream switches protocols, then speaks well after the timeout.
	gw := gateway(t, func(w http.ResponseWriter, _ *http.Request) {
		conn, rw, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		_ = rw.Flush()
		time.Sleep(300 * time.Millisecond)
		_, _ = rw.WriteString("hello")
		_ = rw.Flush()
	})

	conn, err := net.Dial("tcp", strings.TrimPrefix(gw.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	_, _ = io.WriteString(conn, "GET /api/v1/orders/1/live HTTP/1.1\r\nHost: gw\r\nAuthorization: Bearer t\r\n"+
		"Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n")

	r := bufio.NewReader(conn)
	res, err := http.ReadResponse(r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("got %d, want 101", res.StatusCode)
	}
	msg := make([]byte, len("hello"))
	if _, err := io.ReadFull(r, msg); err != nil || string(msg) != "hello" {
		t.Fatalf("got %q, %v; the socket should stay open past the timeout", msg, err)
	}
}
