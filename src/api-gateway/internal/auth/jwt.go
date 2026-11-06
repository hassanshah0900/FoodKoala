package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

// ErrInvalidToken wraps every reason a token is rejected.
var ErrInvalidToken = errors.New("invalid token")

const maxTokenBytes = 8 << 10

// Claims are the access token claims documented in contracts/openapi/auth-service.yaml.
type Claims struct {
	Subject   string   `json:"sub"`
	Issuer    string   `json:"iss"`
	Audience  audience `json:"aud"`
	ExpiresAt int64    `json:"exp"`
	NotBefore int64    `json:"nbf"`
	IssuedAt  int64    `json:"iat"`
	Phone     string   `json:"phone"`
	Roles     []string `json:"roles"`
}

// KeySource looks up a public key by kid. *JWKS implements it.
type KeySource interface {
	Key(ctx context.Context, kid string) (*rsa.PublicKey, error)
}

// Verifier checks RS256 access tokens.
type Verifier struct {
	Keys     KeySource
	Issuer   string
	Audience string
	Leeway   time.Duration
	Now      func() time.Time
}

// Verify returns the token's claims if its signature, algorithm, lifetime,
// issuer and audience are all valid.
func (v *Verifier) Verify(ctx context.Context, token string) (*Claims, error) {
	if len(token) > maxTokenBytes {
		return nil, invalid("token too large")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, invalid("malformed")
	}

	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := decodeSegment(parts[0], &header); err != nil {
		return nil, invalid("header: %v", err)
	}
	// Only RS256: rejects "none", HS256 key confusion and anything else.
	if header.Alg != "RS256" {
		return nil, invalid("alg %q not allowed", header.Alg)
	}
	if header.Kid == "" {
		return nil, invalid("missing kid")
	}

	key, err := v.Keys.Key(ctx, header.Kid)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, invalid("signature encoding")
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], sig); err != nil {
		return nil, invalid("bad signature")
	}

	var c Claims
	if err := decodeSegment(parts[1], &c); err != nil {
		return nil, invalid("payload: %v", err)
	}
	now := v.now()
	switch {
	case c.Subject == "":
		return nil, invalid("missing sub")
	case c.ExpiresAt == 0:
		return nil, invalid("missing exp")
	case now.After(time.Unix(c.ExpiresAt, 0).Add(v.Leeway)):
		return nil, invalid("expired")
	case c.NotBefore != 0 && now.Add(v.Leeway).Before(time.Unix(c.NotBefore, 0)):
		return nil, invalid("not valid yet")
	case c.Issuer != v.Issuer:
		return nil, invalid("issuer %q", c.Issuer)
	case !slices.Contains(c.Audience, v.Audience):
		return nil, invalid("audience %v", []string(c.Audience))
	}
	return &c, nil
}

func (v *Verifier) now() time.Time {
	if v.Now != nil {
		return v.Now()
	}
	return time.Now()
}

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidToken, fmt.Sprintf(format, args...))
}

func decodeSegment(seg string, v any) error {
	raw, err := base64.RawURLEncoding.DecodeString(seg)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, v)
}

// audience accepts the JWT "aud" claim as a string or an array of strings.
type audience []string

func (a *audience) UnmarshalJSON(b []byte) error {
	var one string
	if err := json.Unmarshal(b, &one); err == nil {
		*a = audience{one}
		return nil
	}
	var many []string
	if err := json.Unmarshal(b, &many); err != nil {
		return errors.New("aud must be a string or array of strings")
	}
	*a = many
	return nil
}
