CREATE TABLE IF NOT EXISTS "feedbacks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"problem_id" bigint,
	"source_path" varchar(200),
	"body" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"fail_reason" varchar(20),
	"task_id" varchar(100),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_tried_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feedbacks_status_check" CHECK ("feedbacks"."status" IN ('PENDING', 'SENT', 'FAILED')),
	CONSTRAINT "feedbacks_fail_reason_check" CHECK ("feedbacks"."fail_reason" IS NULL OR "feedbacks"."fail_reason" IN ('config', 'invalid', 'busy', 'down'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedbacks_status_created_idx" ON "feedbacks" USING btree ("status","created_at");