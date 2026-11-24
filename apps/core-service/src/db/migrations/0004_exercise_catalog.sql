CREATE TABLE "core"."exercise_translations" (
	"exercise_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"instructions" text[] DEFAULT '{}'::text[] NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "exercise_translations_exercise_id_locale_pk" PRIMARY KEY("exercise_id","locale"),
	CONSTRAINT "exercise_translations_locale_check" CHECK (locale in ('en', 'uk'))
);
--> statement-breakpoint
CREATE TABLE "core"."exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text,
	"source" text NOT NULL,
	"source_id" text,
	"visibility" text NOT NULL,
	"type" text NOT NULL,
	"primary_muscles" text[] NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"equipment" text DEFAULT 'none' NOT NULL,
	"category" text,
	"force" text,
	"mechanic" text,
	"level" text,
	"image_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_source_source_id_unique" UNIQUE("source","source_id"),
	CONSTRAINT "exercises_id_type_unique" UNIQUE("id","type"),
	CONSTRAINT "exercises_owner_check" CHECK ((owner_id is null and source <> 'user' and source_id is not null and visibility = 'public') or (owner_id is not null and source = 'user')),
	CONSTRAINT "exercises_source_check" CHECK (source in ('free-exercise-db', 'onemore', 'user')),
	CONSTRAINT "exercises_visibility_check" CHECK (visibility in ('private', 'link', 'public')),
	CONSTRAINT "exercises_type_check" CHECK (type in ('weight_reps', 'bodyweight_reps', 'duration', 'distance_duration', 'weight_distance')),
	CONSTRAINT "exercises_primary_muscles_check" CHECK (cardinality(primary_muscles) >= 1 and primary_muscles <@ array['chest', 'lats', 'upper_back', 'lower_back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck', 'full_body', 'cardio', 'other']::text[]),
	CONSTRAINT "exercises_secondary_muscles_check" CHECK (secondary_muscles <@ array['chest', 'lats', 'upper_back', 'lower_back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck']::text[] and not (primary_muscles && secondary_muscles)),
	CONSTRAINT "exercises_equipment_check" CHECK (equipment in ('none', 'barbell', 'ez_bar', 'trap_bar', 'dumbbell', 'kettlebell', 'plate', 'machine', 'cable', 'smith_machine', 'suspension', 'band', 'medicine_ball', 'exercise_ball', 'foam_roll', 'other')),
	CONSTRAINT "exercises_category_check" CHECK (category in ('strength', 'powerlifting', 'olympic_weightlifting', 'strongman', 'cardio', 'stretching', 'plyometrics')),
	CONSTRAINT "exercises_force_check" CHECK (force in ('push', 'pull', 'static')),
	CONSTRAINT "exercises_mechanic_check" CHECK (mechanic in ('compound', 'isolation')),
	CONSTRAINT "exercises_level_check" CHECK (level in ('beginner', 'intermediate', 'expert'))
);
--> statement-breakpoint
ALTER TABLE "core"."exercise_translations" ADD CONSTRAINT "exercise_translations_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "core"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_owner_id_idx" ON "core"."exercises" USING btree ("owner_id") WHERE "core"."exercises"."owner_id" is not null;