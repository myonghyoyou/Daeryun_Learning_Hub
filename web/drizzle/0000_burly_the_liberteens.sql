CREATE TABLE IF NOT EXISTS "attempt_blank_answers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"attempt_id" bigint NOT NULL,
	"blank_key" varchar(50) NOT NULL,
	"submitted_answer" varchar(500),
	"is_correct" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attempt_choices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"attempt_id" bigint NOT NULL,
	"choice_id" bigint NOT NULL,
	"choice_text" varchar(500),
	CONSTRAINT "attempt_choices_attempt_id_choice_id_unique" UNIQUE("attempt_id","choice_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"problem_id" bigint NOT NULL,
	"submitted_answer" varchar(500),
	"is_correct" boolean NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" bigint NOT NULL,
	"action" varchar(50) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" bigint,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "departments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code"),
	CONSTRAINT "departments_status_check" CHECK ("departments"."status" IN ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "excel_upload_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uploaded_by" bigint NOT NULL,
	"department_id" bigint,
	"file_name" varchar(255) NOT NULL,
	"total_rows" integer NOT NULL,
	"success_rows" integer NOT NULL,
	"fail_rows" integer NOT NULL,
	"error_detail" text,
	"target_type" varchar(20) DEFAULT 'PROBLEM' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "excel_upload_logs_target_type_check" CHECK ("excel_upload_logs"."target_type" IN ('ACCOUNT', 'PROBLEM'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "problem_answers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"problem_id" bigint NOT NULL,
	"answer_text" varchar(500) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "problem_blanks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"problem_id" bigint NOT NULL,
	"blank_key" varchar(50) NOT NULL,
	"answer_text" varchar(500) NOT NULL,
	"display_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "problem_choices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"problem_id" bigint NOT NULL,
	"choice_text" varchar(500) NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"display_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "problem_tags" (
	"problem_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "problem_tags_problem_id_tag_id_pk" PRIMARY KEY("problem_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "problems" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"image_url" varchar(500),
	"reference_text" text,
	"explanation" text,
	"blank_reveal_count" integer,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"department_id" bigint NOT NULL,
	"source_number" integer,
	"created_by" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_problems_department_source_number" UNIQUE("department_id","source_number"),
	CONSTRAINT "problems_type_check" CHECK ("problems"."type" IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX', 'SHORT_ANSWER', 'FILL_BLANK')),
	CONSTRAINT "problems_status_check" CHECK ("problems"."status" IN ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"employee_no" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"department_id" bigint NOT NULL,
	"role" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_employee_no_unique" UNIQUE("employee_no"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('SUPER_ADMIN', 'DEPT_ADMIN', 'EMPLOYEE')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempt_blank_answers" ADD CONSTRAINT "attempt_blank_answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempt_choices" ADD CONSTRAINT "attempt_choices_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempts" ADD CONSTRAINT "attempts_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "excel_upload_logs" ADD CONSTRAINT "excel_upload_logs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "excel_upload_logs" ADD CONSTRAINT "excel_upload_logs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problem_answers" ADD CONSTRAINT "problem_answers_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problem_blanks" ADD CONSTRAINT "problem_blanks_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problem_choices" ADD CONSTRAINT "problem_choices_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problem_tags" ADD CONSTRAINT "problem_tags_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problem_tags" ADD CONSTRAINT "problem_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problems" ADD CONSTRAINT "problems_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problems" ADD CONSTRAINT "problems_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attempt_choices_choice_id" ON "attempt_choices" USING btree ("choice_id");