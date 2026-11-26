CREATE TABLE "core"."media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"purpose" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" text NOT NULL,
	"version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_assets_purpose_check" CHECK ("core"."media_assets"."purpose" in ('avatar', 'exercise_photo')),
	CONSTRAINT "media_assets_status_check" CHECK ("core"."media_assets"."status" in ('pending', 'ready', 'attached', 'trash')),
	CONSTRAINT "media_assets_version_check" CHECK ("core"."media_assets"."status" = 'pending' or "core"."media_assets"."version" is not null)
);
--> statement-breakpoint
ALTER TABLE "core"."exercises" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_owner_status_idx" ON "core"."media_assets" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "media_assets_status_updated_idx" ON "core"."media_assets" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "core"."exercises" ADD CONSTRAINT "exercises_photo_id_media_assets_id_fk" FOREIGN KEY ("photo_id") REFERENCES "core"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_avatar_id_media_assets_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "core"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."exercises" ADD CONSTRAINT "exercises_photo_id_unique" UNIQUE("photo_id");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_avatar_id_unique" UNIQUE("avatar_id");