CREATE SCHEMA "orders";
--> statement-breakpoint
CREATE TYPE "orders"."actor" AS ENUM('customer', 'restaurant', 'admin');--> statement-breakpoint
CREATE TYPE "orders"."payment_method" AS ENUM('cod', 'card', 'jazzcash', 'easypaisa');--> statement-breakpoint
CREATE TYPE "orders"."order_status" AS ENUM('placed', 'accepted', 'ready', 'picked_up', 'delivered', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "orders"."order_lines" (
	"order_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" smallint NOT NULL,
	"options" jsonb NOT NULL,
	"note" text,
	"unit_price_paisa" integer NOT NULL,
	"line_total_paisa" integer NOT NULL,
	CONSTRAINT "order_lines_order_id_position_key" UNIQUE("order_id","position"),
	CONSTRAINT "order_lines_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "order_lines_total_adds_up" CHECK ("line_total_paisa" = "unit_price_paisa" * "quantity")
);
--> statement-breakpoint
CREATE TABLE "orders"."order_status_history" (
	"id" bigserial PRIMARY KEY,
	"order_id" uuid NOT NULL,
	"status" "orders"."order_status" NOT NULL,
	"actor" "orders"."actor" NOT NULL,
	"actor_id" uuid NOT NULL,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"customer_id" uuid NOT NULL,
	"customer_phone" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"restaurant_name" text NOT NULL,
	"delivery_zone_id" uuid NOT NULL,
	"status" "orders"."order_status" DEFAULT 'placed'::"orders"."order_status" NOT NULL,
	"payment_method" "orders"."payment_method" NOT NULL,
	"delivery_address" jsonb NOT NULL,
	"note" text,
	"subtotal_paisa" integer NOT NULL,
	"delivery_fee_paisa" integer NOT NULL,
	"total_paisa" integer NOT NULL,
	"prep_time_minutes" smallint,
	"estimated_delivery_at" timestamp with time zone NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_customer_id_idempotency_key_key" UNIQUE("customer_id","idempotency_key"),
	CONSTRAINT "orders_total_adds_up" CHECK ("total_paisa" = "subtotal_paisa" + "delivery_fee_paisa"),
	CONSTRAINT "orders_money_not_negative" CHECK ("subtotal_paisa" >= 0 and "delivery_fee_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders"."outbox" (
	"id" bigserial PRIMARY KEY,
	"event_id" uuid NOT NULL UNIQUE,
	"topic" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "order_status_history_order_id_idx" ON "orders"."order_status_history" ("order_id","id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_placed_at_idx" ON "orders"."orders" ("customer_id","placed_at");--> statement-breakpoint
CREATE INDEX "orders_restaurant_id_placed_at_idx" ON "orders"."orders" ("restaurant_id","placed_at");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "orders"."outbox" ("id") WHERE "published_at" is null;--> statement-breakpoint
ALTER TABLE "orders"."order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders"."order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE CASCADE;