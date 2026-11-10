-- +goose Up
-- Sum and number of customers' ratings (order.reviewed), for the rider's average.
ALTER TABLE delivery.riders
    ADD COLUMN rating_sum   integer NOT NULL DEFAULT 0,
    ADD COLUMN rating_count integer NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE delivery.riders DROP COLUMN rating_sum, DROP COLUMN rating_count;
