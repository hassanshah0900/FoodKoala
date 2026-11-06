CREATE SCHEMA "users";
--> statement-breakpoint
CREATE TYPE "users"."address_label" AS ENUM('home', 'work', 'other');--> statement-breakpoint
CREATE TYPE "users"."language" AS ENUM('en', 'ur');--> statement-breakpoint
CREATE TABLE "users"."addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"label" "users"."address_label" NOT NULL,
	"label_text" text,
	"line1" text NOT NULL,
	"area" text NOT NULL,
	"city" text NOT NULL,
	"landmark" text,
	"instructions" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users"."profiles" (
	"id" uuid PRIMARY KEY,
	"phone" text NOT NULL,
	"name" text,
	"email" text,
	"preferred_language" "users"."language" DEFAULT 'en'::"users"."language" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "addresses_user_id_idx" ON "users"."addresses" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "users"."addresses" ("user_id") WHERE "is_default";--> statement-breakpoint
ALTER TABLE "users"."addresses" ADD CONSTRAINT "addresses_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."profiles"("id") ON DELETE CASCADE;