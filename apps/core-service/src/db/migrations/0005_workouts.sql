CREATE TABLE "core"."session_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"exercise_type" text NOT NULL,
	"position" smallint NOT NULL,
	"rest_seconds" integer,
	"notes" text,
	CONSTRAINT "session_exercises_session_position_unique" UNIQUE("session_id","position"),
	CONSTRAINT "session_exercises_id_type_unique" UNIQUE("id","exercise_type"),
	CONSTRAINT "session_exercises_position_check" CHECK ("core"."session_exercises"."position" >= 0),
	CONSTRAINT "session_exercises_rest_check" CHECK ("core"."session_exercises"."rest_seconds" is null or "core"."session_exercises"."rest_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "core"."session_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"exercise_type" text NOT NULL,
	"position" smallint NOT NULL,
	"kind" text DEFAULT 'working' NOT NULL,
	"weight_kg" numeric(7, 3),
	"reps" integer,
	"duration_s" integer,
	"distance_m" numeric(9, 2),
	"completed_at" timestamp with time zone,
	CONSTRAINT "session_sets_exercise_position_unique" UNIQUE("session_exercise_id","position"),
	CONSTRAINT "session_sets_kind_check" CHECK (kind in ('warmup', 'working', 'drop', 'failure')),
	CONSTRAINT "session_sets_position_check" CHECK ("core"."session_sets"."position" >= 0),
	CONSTRAINT "session_sets_shape_check" CHECK (case "core"."session_sets"."exercise_type"
        when 'weight_reps' then weight_kg is not null and reps is not null and duration_s is null and distance_m is null
        when 'bodyweight_reps' then reps is not null and duration_s is null and distance_m is null
        when 'duration' then duration_s is not null and weight_kg is null and reps is null and distance_m is null
        when 'distance_duration' then (duration_s is not null or distance_m is not null) and weight_kg is null and reps is null
        when 'weight_distance' then weight_kg is not null and distance_m is not null and reps is null
        else false
      end),
	CONSTRAINT "session_sets_values_check" CHECK ((reps is null or reps >= 0) and (duration_s is null or duration_s > 0) and (distance_m is null or distance_m > 0) and (weight_kg is null or weight_kg >= 0 or exercise_type = 'bodyweight_reps'))
);
--> statement-breakpoint
CREATE TABLE "core"."workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"time_zone" text NOT NULL,
	"body_weight_kg" numeric(7, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sessions_period_check" CHECK ("core"."workout_sessions"."ended_at" >= "core"."workout_sessions"."started_at")
);
--> statement-breakpoint
ALTER TABLE "core"."session_exercises" ADD CONSTRAINT "session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "core"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."session_exercises" ADD CONSTRAINT "session_exercises_exercise_fk" FOREIGN KEY ("exercise_id","exercise_type") REFERENCES "core"."exercises"("id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."session_sets" ADD CONSTRAINT "session_sets_session_exercise_fk" FOREIGN KEY ("session_exercise_id","exercise_type") REFERENCES "core"."session_exercises"("id","exercise_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."workout_sessions" ADD CONSTRAINT "workout_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_exercises_exercise_idx" ON "core"."session_exercises" USING btree ("exercise_id","session_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_owner_local_date_idx" ON "core"."workout_sessions" USING btree ("owner_id","local_date");--> statement-breakpoint
CREATE INDEX "workout_sessions_owner_started_at_idx" ON "core"."workout_sessions" USING btree ("owner_id","started_at" desc);