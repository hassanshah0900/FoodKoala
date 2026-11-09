ALTER TYPE "orders"."actor" ADD VALUE 'system';--> statement-breakpoint
ALTER TABLE "orders"."order_status_history" ALTER COLUMN "actor_id" DROP NOT NULL;