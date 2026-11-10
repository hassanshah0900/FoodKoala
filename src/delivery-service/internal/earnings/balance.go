package earnings

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/hassanshah0900/FoodKoala/src/delivery-service/internal/httpx"
)

// Balance is what a rider and FoodKoala owe each other (Balance in the contract).
type Balance struct {
	// Cash collected at the door and not handed in yet.
	CashInHandPaisa int `json:"cashInHandPaisa"`
	// Delivery fees and tips not paid to the rider yet.
	UnpaidEarningsPaisa int `json:"unpaidEarningsPaisa"`
	// Unpaid earnings less cash in hand: above 0 FoodKoala owes the rider, below 0 the rider owes FoodKoala.
	NetPaisa int `json:"netPaisa"`
}

// Totals since the rider started, from delivered deliveries and settlements.
type totals struct {
	earned, collected int
	// Settled cash (deposited or kept) and settled earnings (paid out or kept).
	cashSettled, earningsSettled int
}

func balanceOf(t totals) Balance {
	cash := t.collected - t.cashSettled
	unpaid := t.earned - t.earningsSettled
	return Balance{CashInHandPaisa: cash, UnpaidEarningsPaisa: unpaid, NetPaisa: unpaid - cash}
}

var kinds = map[string]bool{"cash_deposit": true, "payout": true, "kept_from_cash": true}

// allow refuses a settlement the balance doesn't cover: handing in more cash
// than the rider holds, or paying more than they earned.
func (b Balance) allow(kind string, amount int) error {
	if !kinds[kind] {
		return httpx.Errorf(http.StatusBadRequest, "kind must be cash_deposit, payout or kept_from_cash")
	}
	if amount <= 0 {
		return httpx.Errorf(http.StatusBadRequest, "amountPaisa must be positive")
	}
	if kind != "payout" && amount > b.CashInHandPaisa {
		return httpx.Errorf(http.StatusConflict, "The rider holds only %s in cash", rupees(b.CashInHandPaisa))
	}
	if kind != "cash_deposit" && amount > b.UnpaidEarningsPaisa {
		return httpx.Errorf(http.StatusConflict, "The rider is owed only %s", rupees(b.UnpaidEarningsPaisa))
	}
	return nil
}

// rupees reads paisa the way an admin does: 117250 -> "Rs 1,172.50", 50000 -> "Rs 500".
func rupees(paisa int) string {
	whole := strconv.Itoa(paisa / 100)
	for i := len(whole) - 3; i > 0; i -= 3 {
		whole = whole[:i] + "," + whole[i:]
	}
	if paisa%100 == 0 {
		return "Rs " + whole
	}
	return fmt.Sprintf("Rs %s.%02d", whole, paisa%100)
}
