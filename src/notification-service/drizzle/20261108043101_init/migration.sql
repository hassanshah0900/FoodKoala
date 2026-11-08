CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE TYPE "notifications"."notification_kind" AS ENUM('order_placed', 'order_accepted', 'order_ready', 'order_picked_up', 'order_delivered', 'order_rejected', 'order_cancelled');--> statement-breakpoint
CREATE TYPE "notifications"."sms_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "notifications"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL UNIQUE,
	"kind" "notifications"."notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."sms_messages" (
	"id" bigserial PRIMARY KEY,
	"notification_id" uuid NOT NULL UNIQUE,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"status" "notifications"."sms_status" DEFAULT 'queued'::"notifications"."sms_status" NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"."notifications" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications"."notifications" ("user_id") WHERE "read_at" is null;--> statement-breakpoint
CREATE INDEX "sms_messages_queued_idx" ON "notifications"."sms_messages" ("next_attempt_at") WHERE "status" = 'queued';--> statement-breakpoint
ALTER TABLE "notifications"."sms_messages" ADD CONSTRAINT "sms_messages_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"."notifications"("id") ON DELETE CASCADE;