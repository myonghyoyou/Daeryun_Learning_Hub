CREATE TABLE IF NOT EXISTS "solve_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"department_id" bigint NOT NULL,
	"mode" varchar(10) NOT NULL,
	"problem_ids" jsonb NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'IN_PROGRESS' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "solve_runs_mode_check" CHECK ("solve_runs"."mode" IN ('ALL', 'WRONG')),
	CONSTRAINT "solve_runs_status_check" CHECK ("solve_runs"."status" IN ('IN_PROGRESS', 'FINISHED'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solve_runs" ADD CONSTRAINT "solve_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solve_runs" ADD CONSTRAINT "solve_runs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "solve_runs_one_active" ON "solve_runs" USING btree ("user_id","department_id") WHERE "solve_runs"."status" = 'IN_PROGRESS';