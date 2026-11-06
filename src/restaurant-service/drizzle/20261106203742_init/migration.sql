-- PostGIS ships with the postgis/postgis image; this is a no-op where it is already installed.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE SCHEMA "restaurants";
--> statement-breakpoint
CREATE TYPE "restaurants"."province" AS ENUM('punjab', 'sindh', 'khyber_pakhtunkhwa', 'balochistan', 'islamabad', 'gilgit_baltistan', 'azad_kashmir');--> statement-breakpoint
CREATE TYPE "restaurants"."restaurant_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "restaurants"."delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"area" geometry(Polygon,4326) NOT NULL,
	"delivery_fee_paisa" integer NOT NULL,
	"minimum_order_paisa" integer NOT NULL,
	"delivery_time_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_area_valid" CHECK (ST_IsValid("area"))
);
--> statement-breakpoint
CREATE TABLE "restaurants"."restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cuisines" text[] NOT NULL,
	"phone" text NOT NULL,
	"line1" text NOT NULL,
	"area" text NOT NULL,
	"city" text NOT NULL,
	"province" "restaurants"."province" NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"logo_url" text,
	"cover_url" text,
	"weekly_hours" jsonb DEFAULT '{}' NOT NULL,
	"special_hours" jsonb DEFAULT '[]' NOT NULL,
	"paused_until" timestamp with time zone,
	"status" "restaurants"."restaurant_status" DEFAULT 'pending'::"restaurants"."restaurant_status" NOT NULL,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "delivery_zones_restaurant_id_idx" ON "restaurants"."delivery_zones" ("restaurant_id");--> statement-breakpoint
CREATE INDEX "delivery_zones_area_gist_idx" ON "restaurants"."delivery_zones" USING gist ("area");--> statement-breakpoint
CREATE INDEX "restaurants_owner_id_idx" ON "restaurants"."restaurants" ("owner_id");--> statement-breakpoint
CREATE INDEX "restaurants_status_created_at_idx" ON "restaurants"."restaurants" ("status","created_at");--> statement-breakpoint
ALTER TABLE "restaurants"."delivery_zones" ADD CONSTRAINT "delivery_zones_restaurant_id_restaurants_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"."restaurants"("id") ON DELETE CASCADE;