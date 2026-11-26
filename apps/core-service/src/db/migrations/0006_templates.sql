CREATE TABLE "core"."template_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"exercise_type" text NOT NULL,
	"position" smallint NOT NULL,
	"rest_seconds" integer,
	"notes" text,
	CONSTRAINT "template_exercises_template_position_unique" UNIQUE("template_id","position"),
	CONSTRAINT "template_exercises_id_type_unique" UNIQUE("id","exercise_type"),
	CONSTRAINT "template_exercises_position_check" CHECK ("core"."template_exercises"."position" >= 0),
	CONSTRAINT "template_exercises_rest_check" CHECK ("core"."template_exercises"."rest_seconds" is null or "core"."template_exercises"."rest_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "core"."template_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_exercise_id" uuid NOT NULL,
	"exercise_type" text NOT NULL,
	"position" smallint NOT NULL,
	"kind" text DEFAULT 'working' NOT NULL,
	"weight_kg" numeric(7, 3),
	"reps" integer,
	"duration_s" integer,
	"distance_m" numeric(9, 2),
	CONSTRAINT "template_sets_exercise_position_unique" UNIQUE("template_exercise_id","position"),
	CONSTRAINT "template_sets_kind_check" CHECK (kind in ('warmup', 'working', 'drop', 'failure')),
	CONSTRAINT "template_sets_position_check" CHECK ("core"."template_sets"."position" >= 0),
	CONSTRAINT "template_sets_shape_check" CHECK (case "core"."template_sets"."exercise_type"
        when 'weight_reps' then duration_s is null and distance_m is null
        when 'bodyweight_reps' then duration_s is null and distance_m is null
        when 'duration' then weight_kg is null and reps is null and distance_m is null
        when 'distance_duration' then weight_kg is null and reps is null
        when 'weight_distance' then reps is null
        else false
      end),
	CONSTRAINT "template_sets_values_check" CHECK ((reps is null or reps >= 0) and (duration_s is null or duration_s > 0) and (distance_m is null or distance_m > 0) and (weight_kg is null or weight_kg >= 0 or exercise_type = 'bodyweight_reps'))
);
--> statement-breakpoint
CREATE TABLE "core"."templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_visibility_check" CHECK (visibility in ('private', 'link', 'public'))
);
--> statement-breakpoint
ALTER TABLE "core"."workout_sessions" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."template_exercises" ADD CONSTRAINT "template_exercises_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "core"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."template_exercises" ADD CONSTRAINT "template_exercises_exercise_fk" FOREIGN KEY ("exercise_id","exercise_type") REFERENCES "core"."exercises"("id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."template_sets" ADD CONSTRAINT "template_sets_template_exercise_fk" FOREIGN KEY ("template_exercise_id","exercise_type") REFERENCES "core"."template_exercises"("id","exercise_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."templates" ADD CONSTRAINT "templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_exercises_exercise_idx" ON "core"."template_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "templates_owner_active_idx" ON "core"."templates" USING btree ("owner_id","created_at") WHERE "core"."templates"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "core"."workout_sessions" ADD CONSTRAINT "workout_sessions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "core"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_sessions_template_idx" ON "core"."workout_sessions" USING btree ("template_id","started_at" desc);