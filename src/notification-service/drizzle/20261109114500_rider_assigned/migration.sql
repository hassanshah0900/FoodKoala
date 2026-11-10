ALTER TYPE "notifications"."notification_kind" ADD VALUE 'rider_assigned';--> statement-breakpoint
ALTER TYPE "notifications"."notification_kind" ADD VALUE 'delivery_assigned';--> statement-breakpoint
ALTER TABLE "notifications"."notifications" DROP CONSTRAINT "notifications_event_id_key";--> statement-breakpoint
ALTER TABLE "notifications"."notifications" ADD CONSTRAINT "notifications_event_id_user_id_key" UNIQUE("event_id","user_id");