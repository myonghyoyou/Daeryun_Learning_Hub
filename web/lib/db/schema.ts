import {
  pgTable, bigserial, varchar, text, integer, boolean, timestamp, bigint, jsonb,
  index, primaryKey, unique, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const departments = pgTable("departments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  statusCheck: check("departments_status_check", sql`${t.status} IN ('ACTIVE', 'INACTIVE')`),
}));

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  employeeNo: varchar("employee_no", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  departmentId: bigint("department_id", { mode: "number" }).notNull().references(() => departments.id),
  role: varchar("role", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  roleCheck: check("users_role_check", sql`${t.role} IN ('SUPER_ADMIN', 'DEPT_ADMIN', 'EMPLOYEE')`),
  statusCheck: check("users_status_check", sql`${t.status} IN ('ACTIVE', 'INACTIVE')`),
}));

export const problems = pgTable("problems", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),
  content: text("content").notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  referenceText: text("reference_text"),
  explanation: text("explanation"),
  blankRevealCount: integer("blank_reveal_count"),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  departmentId: bigint("department_id", { mode: "number" }).notNull().references(() => departments.id),
  sourceNumber: integer("source_number"),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uqDeptSource: unique("uq_problems_department_source_number").on(t.departmentId, t.sourceNumber),
  typeCheck: check("problems_type_check", sql`${t.type} IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX', 'SHORT_ANSWER', 'FILL_BLANK')`),
  statusCheck: check("problems_status_check", sql`${t.status} IN ('ACTIVE', 'ARCHIVED')`),
}));

export const problemChoices = pgTable("problem_choices", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  choiceText: varchar("choice_text", { length: 500 }).notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  displayOrder: integer("display_order").notNull(),
});

export const problemAnswers = pgTable("problem_answers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  answerText: varchar("answer_text", { length: 500 }).notNull(),
});

export const problemBlanks = pgTable("problem_blanks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  blankKey: varchar("blank_key", { length: 50 }).notNull(),
  answerText: varchar("answer_text", { length: 500 }).notNull(),
  displayOrder: integer("display_order").notNull(),
});

export const attempts = pgTable("attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id),
  submittedAnswer: varchar("submitted_answer", { length: 500 }),
  isCorrect: boolean("is_correct").notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const attemptBlankAnswers = pgTable("attempt_blank_answers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  attemptId: bigint("attempt_id", { mode: "number" }).notNull().references(() => attempts.id, { onDelete: "cascade" }),
  blankKey: varchar("blank_key", { length: 50 }).notNull(),
  submittedAnswer: varchar("submitted_answer", { length: 500 }),
  isCorrect: boolean("is_correct").notNull(),
});

// choice_id 에 FK 를 걸지 않는 것은 의도(현재 schema.sql 주석): 문제 수정이 보기를 지우고 다시 넣어
// CASCADE 는 풀이 기록을 지우고 RESTRICT 는 수정을 막는다. 제출 시점 보기 본문을 함께 남긴다.
export const attemptChoices = pgTable("attempt_choices", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  attemptId: bigint("attempt_id", { mode: "number" }).notNull().references(() => attempts.id, { onDelete: "cascade" }),
  choiceId: bigint("choice_id", { mode: "number" }).notNull(),
  choiceText: varchar("choice_text", { length: 500 }),
}, (t) => ({
  uqAttemptChoice: unique().on(t.attemptId, t.choiceId),
  choiceIdIdx: index("idx_attempt_choices_choice_id").on(t.choiceId),
}));

export const excelUploadLogs = pgTable("excel_upload_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull().references(() => users.id),
  departmentId: bigint("department_id", { mode: "number" }).references(() => departments.id),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  totalRows: integer("total_rows").notNull(),
  successRows: integer("success_rows").notNull(),
  failRows: integer("fail_rows").notNull(),
  errorDetail: text("error_detail"),
  targetType: varchar("target_type", { length: 20 }).notNull().default("PROBLEM"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  targetTypeCheck: check("excel_upload_logs_target_type_check", sql`${t.targetType} IN ('ACCOUNT', 'PROBLEM')`),
}));

export const tags = pgTable("tags", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const problemTags = pgTable("problem_tags", {
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  tagId: bigint("tag_id", { mode: "number" }).notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.problemId, t.tagId] }),
}));

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: bigint("actor_id", { mode: "number" }).notNull().references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetId: bigint("target_id", { mode: "number" }),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
