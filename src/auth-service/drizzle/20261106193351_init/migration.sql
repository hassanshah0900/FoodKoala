CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TYPE "auth"."role" AS ENUM('customer', 'vendor', 'rider', 'admin');--> statement-breakpoint
CREATE TABLE "auth"."refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"phone" text NOT NULL UNIQUE,
	"roles" "auth"."role"[] DEFAULT '{customer}'::"auth"."role"[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_index" ON "auth"."refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_index" ON "auth"."refresh_tokens" ("family_id");--> statement-breakpoint
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;