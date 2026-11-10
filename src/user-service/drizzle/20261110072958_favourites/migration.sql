CREATE TABLE "users"."favourite_restaurants" (
	"user_id" uuid,
	"restaurant_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourite_restaurants_pkey" PRIMARY KEY("user_id","restaurant_id")
);
--> statement-breakpoint
CREATE INDEX "favourite_restaurants_user_id_added_at_idx" ON "users"."favourite_restaurants" ("user_id","added_at");--> statement-breakpoint
ALTER TABLE "users"."favourite_restaurants" ADD CONSTRAINT "favourite_restaurants_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."profiles"("id") ON DELETE CASCADE;