-- The schema `nutrition` is created by infra/db/nutrition.sql (admin), not by migrations.
CREATE TABLE "nutrition"."body_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sex" text NOT NULL,
	"birth_date" date NOT NULL,
	"height_cm" numeric(4, 1) NOT NULL,
	"activity_level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_profiles_sex_check" CHECK (sex in ('male', 'female')),
	CONSTRAINT "body_profiles_activity_check" CHECK (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "body_profiles_height_check" CHECK ("nutrition"."body_profiles"."height_cm" between 100 and 250),
	CONSTRAINT "body_profiles_birth_date_check" CHECK ("nutrition"."body_profiles"."birth_date" >= '1900-01-01')
);
--> statement-breakpoint
CREATE TABLE "nutrition"."food_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"meal" text NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(7, 1),
	"unit" text,
	"calories_kcal" integer NOT NULL,
	"protein_g" numeric(5, 1),
	"fat_g" numeric(5, 1),
	"carbs_g" numeric(5, 1),
	"source" text NOT NULL,
	"user_food_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_entries_meal_check" CHECK (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
	CONSTRAINT "food_entries_source_check" CHECK (source in ('manual', 'suggestion')),
	CONSTRAINT "food_entries_unit_check" CHECK ("nutrition"."food_entries"."unit" is null or unit in ('g', 'ml', 'pcs', 'serving')),
	CONSTRAINT "food_entries_name_check" CHECK (char_length("nutrition"."food_entries"."name") between 1 and 200),
	CONSTRAINT "food_entries_amount_check" CHECK (("nutrition"."food_entries"."amount" is null) = ("nutrition"."food_entries"."unit" is null) and ("nutrition"."food_entries"."amount" is null or "nutrition"."food_entries"."amount" > 0)),
	CONSTRAINT "food_entries_values_check" CHECK ("nutrition"."food_entries"."calories_kcal" between 0 and 10000 and ("nutrition"."food_entries"."protein_g" is null or "nutrition"."food_entries"."protein_g" between 0 and 1000) and ("nutrition"."food_entries"."fat_g" is null or "nutrition"."food_entries"."fat_g" between 0 and 1000) and ("nutrition"."food_entries"."carbs_g" is null or "nutrition"."food_entries"."carbs_g" between 0 and 1000))
);
--> statement-breakpoint
CREATE TABLE "nutrition"."user_foods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"amount" numeric(7, 1),
	"unit" text,
	"meal" text,
	"calories_kcal" integer NOT NULL,
	"protein_g" numeric(5, 1),
	"fat_g" numeric(5, 1),
	"carbs_g" numeric(5, 1),
	"use_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_foods_user_name_key_unique" UNIQUE("user_id","name_key"),
	CONSTRAINT "user_foods_name_check" CHECK (char_length("nutrition"."user_foods"."name") between 1 and 200 and char_length("nutrition"."user_foods"."name_key") between 1 and 200),
	CONSTRAINT "user_foods_meal_check" CHECK ("nutrition"."user_foods"."meal" is null or meal in ('breakfast', 'lunch', 'dinner', 'snack')),
	CONSTRAINT "user_foods_unit_check" CHECK ("nutrition"."user_foods"."unit" is null or unit in ('g', 'ml', 'pcs', 'serving')),
	CONSTRAINT "user_foods_amount_check" CHECK (("nutrition"."user_foods"."amount" is null) = ("nutrition"."user_foods"."unit" is null) and ("nutrition"."user_foods"."amount" is null or "nutrition"."user_foods"."amount" > 0)),
	CONSTRAINT "user_foods_values_check" CHECK ("nutrition"."user_foods"."calories_kcal" between 0 and 10000 and ("nutrition"."user_foods"."protein_g" is null or "nutrition"."user_foods"."protein_g" between 0 and 1000) and ("nutrition"."user_foods"."fat_g" is null or "nutrition"."user_foods"."fat_g" between 0 and 1000) and ("nutrition"."user_foods"."carbs_g" is null or "nutrition"."user_foods"."carbs_g" between 0 and 1000)),
	CONSTRAINT "user_foods_use_count_check" CHECK ("nutrition"."user_foods"."use_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "nutrition"."goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"rate_kg_per_week" numeric(3, 2),
	"target_weight_kg" numeric(7, 3),
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_user_effective_from_unique" UNIQUE("user_id","effective_from"),
	CONSTRAINT "goals_type_check" CHECK (type in ('lose', 'maintain', 'gain', 'recomp')),
	CONSTRAINT "goals_rate_presence_check" CHECK (("nutrition"."goals"."type" in ('lose', 'gain')) = ("nutrition"."goals"."rate_kg_per_week" is not null)),
	CONSTRAINT "goals_rate_range_check" CHECK ("nutrition"."goals"."rate_kg_per_week" is null or "nutrition"."goals"."rate_kg_per_week" between 0.10 and 1.00),
	CONSTRAINT "goals_target_weight_check" CHECK ("nutrition"."goals"."target_weight_kg" is null or "nutrition"."goals"."target_weight_kg" between 20 and 400)
);
--> statement-breakpoint
CREATE TABLE "nutrition"."target_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"source" text NOT NULL,
	"goal_id" uuid,
	"calories_kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"carbs_g" integer NOT NULL,
	"bmr_kcal" integer,
	"tdee_kcal" integer,
	"floor_applied" boolean DEFAULT false NOT NULL,
	"formula_version" smallint,
	"inputs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "target_snapshots_user_effective_from_unique" UNIQUE("user_id","effective_from"),
	CONSTRAINT "target_snapshots_source_check" CHECK (source in ('auto', 'manual')),
	CONSTRAINT "target_snapshots_source_shape_check" CHECK (("nutrition"."target_snapshots"."source" = 'auto') = ("nutrition"."target_snapshots"."formula_version" is not null and "nutrition"."target_snapshots"."inputs" is not null)),
	CONSTRAINT "target_snapshots_calories_check" CHECK ("nutrition"."target_snapshots"."calories_kcal" between 800 and 8000),
	CONSTRAINT "target_snapshots_macros_check" CHECK ("nutrition"."target_snapshots"."protein_g" >= 0 and "nutrition"."target_snapshots"."fat_g" >= 0 and "nutrition"."target_snapshots"."carbs_g" >= 0)
);
--> statement-breakpoint
CREATE TABLE "nutrition"."weight_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"weight_kg" numeric(7, 3) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weight_entries_user_date_unique" UNIQUE("user_id","local_date"),
	CONSTRAINT "weight_entries_weight_check" CHECK ("nutrition"."weight_entries"."weight_kg" between 20 and 400),
	CONSTRAINT "weight_entries_note_check" CHECK ("nutrition"."weight_entries"."note" is null or char_length("nutrition"."weight_entries"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "nutrition"."food_entries" ADD CONSTRAINT "food_entries_user_food_id_user_foods_id_fk" FOREIGN KEY ("user_food_id") REFERENCES "nutrition"."user_foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition"."target_snapshots" ADD CONSTRAINT "target_snapshots_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "nutrition"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_entries_user_date_idx" ON "nutrition"."food_entries" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "user_foods_user_last_used_idx" ON "nutrition"."user_foods" USING btree ("user_id","last_used_at" desc);