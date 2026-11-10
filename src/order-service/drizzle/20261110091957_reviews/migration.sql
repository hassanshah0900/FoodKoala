CREATE TABLE "orders"."reviews" (
	"order_id" uuid PRIMARY KEY,
	"customer_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"rider_id" uuid,
	"restaurant_rating" smallint NOT NULL,
	"rider_rating" smallint,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_restaurant_rating_range" CHECK ("restaurant_rating" between 1 and 5),
	CONSTRAINT "reviews_rider_rating_range" CHECK ("rider_rating" between 1 and 5),
	CONSTRAINT "reviews_rider_rating_needs_rider" CHECK ("rider_rating" is null or "rider_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "orders"."reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE CASCADE;