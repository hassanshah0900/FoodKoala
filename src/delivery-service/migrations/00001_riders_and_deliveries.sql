-- +goose Up
-- delivery-service owns the `delivery` Postgres schema and nothing else (ADR 0003).
CREATE SCHEMA IF NOT EXISTS delivery;

CREATE TYPE delivery.rider_status AS ENUM ('pending', 'approved', 'suspended');
CREATE TYPE delivery.vehicle AS ENUM ('motorbike', 'bicycle', 'car');
CREATE TYPE delivery.delivery_status AS ENUM ('waiting', 'searching', 'assigned', 'picked_up', 'delivered', 'cancelled');

-- One row per rider, keyed by their auth-service user id.
CREATE TABLE delivery.riders (
    user_id      uuid PRIMARY KEY,
    name         text NOT NULL,
    phone        text NOT NULL,
    vehicle      delivery.vehicle NOT NULL,
    city         text NOT NULL,
    status       delivery.rider_status NOT NULL DEFAULT 'pending',
    online       boolean NOT NULL DEFAULT false,
    -- Last reported position (WGS 84); stale ones are not used for assignment.
    lat          double precision,
    lng          double precision,
    located_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT riders_location_complete CHECK ((lat IS NULL) = (lng IS NULL) AND (lat IS NULL) = (located_at IS NULL)),
    CONSTRAINT riders_online_needs_location CHECK (NOT online OR lat IS NOT NULL)
);
CREATE INDEX riders_available_idx ON delivery.riders (located_at) WHERE online AND status = 'approved';
CREATE INDEX riders_status_created_at_idx ON delivery.riders (status, created_at);

-- One delivery per order, created from order.placed.
CREATE TABLE delivery.deliveries (
    id               uuid PRIMARY KEY,
    order_id         uuid NOT NULL UNIQUE,
    customer_id      uuid NOT NULL,
    customer_phone   text NOT NULL,
    restaurant_id    uuid NOT NULL,
    restaurant_name  text NOT NULL,
    pickup_lat       double precision NOT NULL,
    pickup_lng       double precision NOT NULL,
    dropoff_lat      double precision NOT NULL,
    dropoff_lng      double precision NOT NULL,
    dropoff_text     text NOT NULL,
    dropoff_landmark text,
    -- What the rider takes at the door: the order total for cash on delivery, else 0.
    cash_to_collect_paisa integer NOT NULL CHECK (cash_to_collect_paisa >= 0),
    -- The order's delivery fee, what the rider earns for it.
    delivery_fee_paisa    integer NOT NULL CHECK (delivery_fee_paisa >= 0),
    status           delivery.delivery_status NOT NULL DEFAULT 'waiting',
    rider_id         uuid REFERENCES delivery.riders (user_id),
    -- Riders who turned this delivery down; it is not offered to them again.
    declined_by      uuid[] NOT NULL DEFAULT '{}',
    food_ready_at    timestamptz,
    searching_since  timestamptz,
    assigned_at      timestamptz,
    picked_up_at     timestamptz,
    delivered_at     timestamptz,
    cancelled_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    -- A rider once assigned; none while still looking. A cancelled delivery keeps whoever had it.
    CONSTRAINT deliveries_rider_when_assigned CHECK (status NOT IN ('assigned', 'picked_up', 'delivered') OR rider_id IS NOT NULL),
    CONSTRAINT deliveries_no_rider_while_searching CHECK (status NOT IN ('waiting', 'searching') OR rider_id IS NULL)
);
-- A rider carries one order at a time.
CREATE UNIQUE INDEX deliveries_one_active_per_rider ON delivery.deliveries (rider_id) WHERE status IN ('assigned', 'picked_up');
CREATE INDEX deliveries_searching_idx ON delivery.deliveries (searching_since) WHERE status = 'searching';
CREATE INDEX deliveries_status_created_at_idx ON delivery.deliveries (status, created_at);
CREATE INDEX deliveries_rider_id_idx ON delivery.deliveries (rider_id, created_at);

-- Envelope ids already applied: Kafka delivers at least once (ADR 0007).
CREATE TABLE delivery.processed_events (
    event_id     uuid PRIMARY KEY,
    type         text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
);

-- Transactional outbox (ADR 0007), published to Kafka by the relay.
CREATE TABLE delivery.outbox (
    id           bigserial PRIMARY KEY,
    event_id     uuid NOT NULL UNIQUE,
    topic        text NOT NULL,
    key          text NOT NULL,
    payload      jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON delivery.outbox (id) WHERE published_at IS NULL;

-- +goose Down
DROP SCHEMA delivery CASCADE;
