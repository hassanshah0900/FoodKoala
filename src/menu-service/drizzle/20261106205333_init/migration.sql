CREATE SCHEMA "menu";
--> statement-breakpoint
CREATE TABLE "menu"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu"."items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"restaurant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_paisa" integer NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"option_groups" jsonb DEFAULT '[]' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "categories_restaurant_id_position_idx" ON "menu"."categories" ("restaurant_id","position");--> statement-breakpoint
CREATE INDEX "items_category_id_position_idx" ON "menu"."items" ("category_id","position");--> statement-breakpoint
CREATE INDEX "items_restaurant_id_idx" ON "menu"."items" ("restaurant_id");--> statement-breakpoint
ALTER TABLE "menu"."items" ADD CONSTRAINT "items_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu"."categories"("id") ON DELETE RESTRICT;