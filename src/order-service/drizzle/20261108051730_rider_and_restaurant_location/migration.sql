ALTER TYPE "orders"."actor" ADD VALUE 'rider';--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD COLUMN "restaurant_location" jsonb;