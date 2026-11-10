package earnings

import (
	"errors"
	"testing"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/httpx"
)

func TestBalanceOf(t *testing.T) {
	b := balanceOf(totals{earned: 30000, collected: 250000, cashSettled: 200000, earningsSettled: 10000})
	want := Balance{CashInHandPaisa: 50000, UnpaidEarningsPaisa: 20000, NetPaisa: -30000}
	if b != want {
		t.Fatalf("got %+v, want %+v", b, want)
	}
}

func TestAllow(t *testing.T) {
	b := Balance{CashInHandPaisa: 50000, UnpaidEarningsPaisa: 20000}
	cases := []struct {
		kind   string
		amount int
		status int // 0 when allowed
	}{
		{"cash_deposit", 50000, 0},
		{"cash_deposit", 50001, 409},
		{"payout", 20000, 0},
		{"payout", 20001, 409},
		{"kept_from_cash", 20000, 0},
		{"kept_from_cash", 20001, 409},
		{"refund", 100, 400},
		{"payout", 0, 400},
	}
	for _, c := range cases {
		err := b.allow(c.kind, c.amount)
		var e *httpx.Error
		switch {
		case c.status == 0 && err != nil:
			t.Errorf("%s %d: %v", c.kind, c.amount, err)
		case c.status != 0 && (!errors.As(err, &e) || e.Status != c.status):
			t.Errorf("%s %d: got %v, want %d", c.kind, c.amount, err, c.status)
		}
	}
}

func TestRupees(t *testing.T) {
	for paisa, want := range map[int]string{0: "Rs 0", 50000: "Rs 500", 117250: "Rs 1,172.50", 32701: "Rs 327.01", 123456700: "Rs 1,234,567"} {
		if got := rupees(paisa); got != want {
			t.Errorf("rupees(%d) = %q, want %q", paisa, got, want)
		}
	}
}
