package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func newTestVerifier(t *testing.T) (*Verifier, testKey, *fakeClock) {
	key := newKey(t, "k1")
	srv := newJWKSServer(t, key)
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	jwks := NewJWKS(srv.URL)
	jwks.Now = clock.Now
	return &Verifier{Keys: jwks, Issuer: "foodkoala-auth", Audience: "foodkoala", Leeway: 30 * time.Second, Now: clock.Now}, key, clock
}

func TestVerifyAcceptsValidToken(t *testing.T) {
	v, key, clock := newTestVerifier(t)

	c, err := v.Verify(context.Background(), key.token(t, clock.Now(), nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.Subject != "7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10" || c.Phone != "+923001234567" || strings.Join(c.Roles, ",") != "customer" {
		t.Fatalf("claims = %+v", c)
	}
}

func TestVerifyAcceptsAudienceArray(t *testing.T) {
	v, key, clock := newTestVerifier(t)
	tok := key.token(t, clock.Now(), map[string]any{"aud": []string{"other", "foodkoala"}})
	if _, err := v.Verify(context.Background(), tok); err != nil {
		t.Fatal(err)
	}
}

func TestVerifyRejects(t *testing.T) {
	v, key, clock := newTestVerifier(t)
	now := clock.Now()
	attacker := newKey(t, "k1") // same kid, different key

	valid := key.token(t, now, nil)
	parts := strings.Split(valid, ".")

	type tc struct{ token, reason string }
	cases := map[string]tc{
		"expired":                 {key.token(t, now, map[string]any{"exp": now.Add(-time.Minute).Unix()}), "expired"},
		"not yet valid":           {key.token(t, now, map[string]any{"nbf": now.Add(time.Minute).Unix()}), "not valid yet"},
		"no exp":                  {key.token(t, now, map[string]any{"exp": nil}), "missing exp"},
		"no sub":                  {key.token(t, now, map[string]any{"sub": nil}), "missing sub"},
		"wrong issuer":            {key.token(t, now, map[string]any{"iss": "evil"}), "issuer"},
		"wrong audience":          {key.token(t, now, map[string]any{"aud": "other-app"}), "audience"},
		"signed by another key":   {attacker.token(t, now, nil), "bad signature"},
		"unknown kid":             {newKey(t, "k2").token(t, now, nil), "unknown signing key"},
		"tampered payload":        {parts[0] + "." + b64.EncodeToString([]byte(`{"sub":"admin","roles":["admin"]}`)) + "." + parts[2], "bad signature"},
		"alg none":                {b64.EncodeToString([]byte(`{"alg":"none","kid":"k1"}`)) + "." + parts[1] + ".", "alg \"none\""},
		"alg HS256":               {key.sign(t, map[string]any{"alg": "HS256", "kid": "k1"}, map[string]any{"sub": "x"}), "alg \"HS256\""},
		"missing kid":             {key.sign(t, map[string]any{"alg": "RS256"}, map[string]any{"sub": "x"}), "missing kid"},
		"two segments":            {parts[0] + "." + parts[1], "malformed"},
		"garbage":                 {"not-a-jwt", "malformed"},
		"oversized":               {strings.Repeat("a", maxTokenBytes+1), "too large"},
		"padded base64 signature": {valid + "=", "signature encoding"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := v.Verify(context.Background(), c.token)
			if !errors.Is(err, ErrInvalidToken) || !strings.Contains(err.Error(), c.reason) {
				t.Fatalf("got %v, want ErrInvalidToken mentioning %q", err, c.reason)
			}
		})
	}
}

func TestVerifyAllowsClockSkewWithinLeeway(t *testing.T) {
	v, key, clock := newTestVerifier(t)
	tok := key.token(t, clock.Now(), map[string]any{"exp": clock.Now().Add(-20 * time.Second).Unix()})
	if _, err := v.Verify(context.Background(), tok); err != nil {
		t.Fatalf("20s past exp is within 30s leeway: %v", err)
	}
}
