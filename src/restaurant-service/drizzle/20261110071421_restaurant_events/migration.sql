CREATE TABLE "restaurants"."outbox" (
	"id" bigserial PRIMARY KEY,
	"event_id" uuid NOT NULL UNIQUE,
	"topic" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "restaurants"."restaurants" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "restaurants"."outbox" ("id") WHERE "published_at" is null;