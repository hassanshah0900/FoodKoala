CREATE TABLE "menu"."menus" (
	"restaurant_id" uuid PRIMARY KEY,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu"."outbox" (
	"id" bigserial PRIMARY KEY,
	"event_id" uuid NOT NULL UNIQUE,
	"topic" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "menu"."outbox" ("id") WHERE "published_at" is null;