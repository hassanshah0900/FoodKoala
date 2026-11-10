CREATE TABLE "restaurants"."reviews" (
	"order_id" uuid PRIMARY KEY,
	"restaurant_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "restaurants"."restaurants" ADD COLUMN "rating_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants"."restaurants" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "reviews_restaurant_id_created_at_idx" ON "restaurants"."reviews" ("restaurant_id","created_at");--> statement-breakpoint
ALTER TABLE "restaurants"."reviews" ADD CONSTRAINT "reviews_restaurant_id_restaurants_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"."restaurants"("id") ON DELETE CASCADE;