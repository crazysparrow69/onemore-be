CREATE TABLE "core"."exercise_stats" (
	"exercise_id" uuid PRIMARY KEY NOT NULL,
	"users_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exercise_stats_users_count_check" CHECK ("core"."exercise_stats"."users_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "core"."exercise_stats" ADD CONSTRAINT "exercise_stats_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "core"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "core"."exercise_stats" ("exercise_id", "users_count")
SELECT se."exercise_id", count(DISTINCT ws."owner_id")::int
FROM "core"."session_exercises" se
JOIN "core"."workout_sessions" ws ON ws."id" = se."session_id"
GROUP BY se."exercise_id";
