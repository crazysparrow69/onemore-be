-- The schema `core` is created by infra/db/core.sql (admin), not by migrations.
CREATE TABLE "core"."accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"units" text NOT NULL,
	"language" text NOT NULL,
	"time_zone" text NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_units_check" CHECK (units in ('kg', 'lb'))
);
