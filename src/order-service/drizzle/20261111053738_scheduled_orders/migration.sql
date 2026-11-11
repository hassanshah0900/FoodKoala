ALTER TABLE "orders"."orders" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
-- Orders placed before scheduling existed were released to the kitchen when placed.
ALTER TABLE "orders"."orders" ADD COLUMN "release_at" timestamp with time zone;--> statement-breakpoint
UPDATE "orders"."orders" SET "release_at" = "placed_at";--> statement-breakpoint
ALTER TABLE "orders"."orders" ALTER COLUMN "release_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_placed_release_at_idx" ON "orders"."orders" ("release_at") WHERE "status" = 'placed';
