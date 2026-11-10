-- +goose Up
-- The customer's tip for the rider, from order.placed; 0 for orders placed before tips.
ALTER TABLE delivery.deliveries ADD COLUMN tip_paisa integer NOT NULL DEFAULT 0 CHECK (tip_paisa >= 0);

-- cash_deposit: the rider hands in cash collected at the door.
-- payout: FoodKoala pays the rider what they earned.
-- kept_from_cash: the rider keeps earnings out of the cash, settling both at once.
CREATE TYPE delivery.settlement_kind AS ENUM ('cash_deposit', 'payout', 'kept_from_cash');

-- Money between a rider and FoodKoala, recorded by admins. Balances are worked
-- out from this and the delivered deliveries; nothing is stored twice.
CREATE TABLE delivery.settlements (
    id           uuid PRIMARY KEY,
    rider_id     uuid NOT NULL REFERENCES delivery.riders (user_id),
    kind         delivery.settlement_kind NOT NULL,
    amount_paisa integer NOT NULL CHECK (amount_paisa > 0),
    note         text,
    recorded_by  uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX settlements_rider_id_created_at_idx ON delivery.settlements (rider_id, created_at);
CREATE INDEX deliveries_rider_delivered_idx ON delivery.deliveries (rider_id, delivered_at) WHERE status = 'delivered';

-- +goose Down
DROP INDEX delivery.deliveries_rider_delivered_idx;
DROP TABLE delivery.settlements;
DROP TYPE delivery.settlement_kind;
ALTER TABLE delivery.deliveries DROP COLUMN tip_paisa;
