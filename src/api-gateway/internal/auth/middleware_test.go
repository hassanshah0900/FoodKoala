package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

const goodToken = "good"

type stubVerifier struct{}

func (stubVerifier) Verify(_ context.Context, token string) (*Claims, error) {
	if token != goodToken {
		return nil, ErrInvalidToken
	}
	return &Claims{Subject: "user-1", Phone: "+923001234567", Roles: []string{"customer", "vendor"}}, nil
}

// echo records the identity headers the upstream service would see.
type echo struct{ got http.Header }

func (e *echo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	e.got = r.Header.Clone()
	w.WriteHeader(http.StatusOK)
}

func do(t *testing.T, path, authz string, extra map[string]string) (*httptest.ResponseRecorder, *echo) {
	t.Helper()
	up := &echo{}
	h := Middleware(stubVerifier{}, DefaultPolicy, up)
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if authz != "" {
		req.Header.Set("Authorization", authz)
	}
	for k, v := range extra {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, up
}

func TestValidTokenForwardsIdentity(t *testing.T) {
	rec, up := do(t, "/api/v1/orders/42", "Bearer "+goodToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	want := map[string]string{HeaderUserID: "user-1", HeaderUserRoles: "customer,vendor", HeaderUserPhone: "+923001234567"}
	for k, v := range want {
		if got := up.got.Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
	if up.got.Get("Authorization") == "" {
		t.Error("Authorization header should be forwarded")
	}
}

func TestProtectedRoutesNeedAToken(t *testing.T) {
	for _, path := range []string{"/api/v1/orders", "/api/v1/cart/items", "/api/v1/users/me", "/api/v1/payments/1"} {
		rec, up := do(t, path, "", nil)
		if rec.Code != http.StatusUnauthorized || up.got != nil {
			t.Errorf("%s: status %d, reached upstream %v", path, rec.Code, up.got != nil)
		}
		if rec.Header().Get("WWW-Authenticate") == "" {
			t.Errorf("%s: missing WWW-Authenticate", path)
		}
	}
}

func TestPublicRoutesAllowAnonymous(t *testing.T) {
	for _, path := range []string{"/api/v1/restaurants", "/api/v1/menus/9", "/api/v1/search?q=biryani", "/api/v1/auth/otp/request"} {
		rec, up := do(t, path, "", nil)
		if rec.Code != http.StatusOK || up.got.Get(HeaderUserID) != "" {
			t.Errorf("%s: status %d, user %q", path, rec.Code, up.got.Get(HeaderUserID))
		}
	}
}

func TestSpoofedIdentityHeadersAreStripped(t *testing.T) {
	spoof := map[string]string{HeaderUserID: "admin-id", HeaderUserRoles: "admin", HeaderUserPhone: "+920000000000"}

	_, up := do(t, "/api/v1/restaurants", "", spoof)
	for k := range spoof {
		if v := up.got.Get(k); v != "" {
			t.Errorf("anonymous: %s leaked through as %q", k, v)
		}
	}

	_, up = do(t, "/api/v1/orders", "Bearer "+goodToken, spoof)
	if up.got.Get(HeaderUserRoles) != "customer,vendor" {
		t.Errorf("authenticated: roles = %q, want the token's", up.got.Get(HeaderUserRoles))
	}
}

func TestInvalidTokenIsRejectedEvenOnPublicRoutes(t *testing.T) {
	for _, path := range []string{"/api/v1/orders", "/api/v1/restaurants"} {
		rec, up := do(t, path, "Bearer forged", nil)
		if rec.Code != http.StatusUnauthorized || up.got != nil {
			t.Errorf("%s: status %d", path, rec.Code)
		}
		if got := rec.Header().Get("WWW-Authenticate"); got != `Bearer realm="foodkoala", error="invalid_token"` {
			t.Errorf("%s: WWW-Authenticate = %q", path, got)
		}
	}
}

func TestAuthServiceIgnoresStaleTokens(t *testing.T) {
	// A client refreshing its session may still send its expired access token.
	rec, up := do(t, "/api/v1/auth/token/refresh", "Bearer expired", map[string]string{HeaderUserID: "x"})
	if rec.Code != http.StatusOK || up.got.Get(HeaderUserID) != "" {
		t.Fatalf("status %d, user %q", rec.Code, up.got.Get(HeaderUserID))
	}
}

func TestMalformedAuthorizationHeader(t *testing.T) {
	for _, h := range []string{"Basic dXNlcjpwYXNz", "Bearer", "Bearer   ", goodToken} {
		rec, _ := do(t, "/api/v1/orders", h, nil)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%q: status %d", h, rec.Code)
		}
	}
	rec, _ := do(t, "/api/v1/orders", "bearer "+goodToken, nil)
	if rec.Code != http.StatusOK {
		t.Errorf("scheme should be case-insensitive, got %d", rec.Code)
	}
}

func TestHealthChecksBypassAuth(t *testing.T) {
	rec, _ := do(t, "/healthz", "Bearer forged", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestWebSocketTokenComesFromTheSubprotocol(t *testing.T) {
	proto := map[string]string{"Sec-WebSocket-Protocol": "foodkoala.tracking.v1, bearer." + goodToken}
	rec, up := do(t, "/api/v1/tracking/orders/1/live", "", proto)
	if rec.Code != http.StatusOK || up.got.Get(HeaderUserID) != "user-1" {
		t.Fatalf("status %d, user %q", rec.Code, up.got.Get(HeaderUserID))
	}
	if got := up.got.Get("Sec-WebSocket-Protocol"); got != "foodkoala.tracking.v1" {
		t.Errorf("forwarded protocols %q: the token must be removed", got)
	}

	rec, up = do(t, "/api/v1/tracking/orders/1/live", "", map[string]string{"Sec-WebSocket-Protocol": "bearer.forged"})
	if rec.Code != http.StatusUnauthorized || up.got != nil {
		t.Errorf("bad token: status %d", rec.Code)
	}

	// Even where tokens are ignored, one in the subprotocols never travels on.
	_, up = do(t, "/api/v1/auth/x", "", map[string]string{"Sec-WebSocket-Protocol": "bearer." + goodToken})
	if v := up.got.Values("Sec-WebSocket-Protocol"); len(v) != 0 {
		t.Errorf("auth-service saw %q", v)
	}
}
