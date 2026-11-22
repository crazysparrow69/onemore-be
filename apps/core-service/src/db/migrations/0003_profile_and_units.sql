ALTER TABLE "core"."users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "units" text DEFAULT 'kg' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_nickname_unique" ON "core"."users" USING btree ("nickname");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_units_check" CHECK (units in ('kg', 'lb'));