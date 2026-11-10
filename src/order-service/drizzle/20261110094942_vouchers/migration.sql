CREATE TYPE "orders"."discount_kind" AS ENUM('percent', 'flat');--> statement-breakpoint
CREATE TABLE "orders"."vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL CONSTRAINT "vouchers_code_key" UNIQUE,
	"description" text NOT NULL,
	"kind" "orders"."discount_kind" NOT NULL,
	"value" integer NOT NULL,
	"max_discount_paisa" integer,
	"min_subtotal_paisa" integer DEFAULT 0 NOT NULL,
	"restaurant_id" uuid,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"usage_limit" integer,
	"per_customer_limit" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_value_positive" CHECK ("value" > 0),
	CONSTRAINT "vouchers_percent_at_most_100" CHECK ("kind" <> 'percent' or "value" <= 100),
	CONSTRAINT "vouchers_ends_after_start" CHECK ("ends_at" > "starts_at"),
	CONSTRAINT "vouchers_limits_positive" CHECK ("per_customer_limit" > 0 and ("usage_limit" is null or "usage_limit" > 0) and ("max_discount_paisa" is null or "max_discount_paisa" > 0) and "min_subtotal_paisa" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD COLUMN "voucher_id" uuid;--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD COLUMN "discount_paisa" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_voucher_id_idx" ON "orders"."orders" ("voucher_id") WHERE "voucher_id" is not null;--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD CONSTRAINT "orders_voucher_id_vouchers_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "orders"."vouchers"("id");--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD CONSTRAINT "orders_discount_within_subtotal" CHECK ("discount_paisa" between 0 and "subtotal_paisa");--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD CONSTRAINT "orders_discount_needs_voucher" CHECK ("discount_paisa" = 0 or "voucher_id" is not null);--> statement-breakpoint
ALTER TABLE "orders"."orders" DROP CONSTRAINT "orders_total_adds_up", ADD CONSTRAINT "orders_total_adds_up" CHECK ("total_paisa" = "subtotal_paisa" + "delivery_fee_paisa" - "discount_paisa");