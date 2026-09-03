import {
  pgTable, bigserial, varchar, text, integer, boolean, timestamp, bigint, jsonb,
  index, primaryKey, unique, uniqueIndex, check,
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

/**
 * 한 팀을 한 번 훑는 단위("바퀴"). 골라서 풀기가 팀 단위로 바뀌면서 생겼다.
 *
 * problem_ids 를 시작 시점에 박아 두는 이유가 있다. 그러지 않으면 푸는 도중 관리자가
 * 문제를 추가하거나 보관 처리했을 때 총 개수와 순서가 발밑에서 바뀐다 — 화면의
 * "12 / 30" 이 갑자기 "12 / 31" 이 된다.
 *
 * results 를 여기 쌓는 이유도 있다. 채점 결과는 attempts 에도 남지만 거기에는 어느
 * 바퀴에서 낸 답인지가 없어, 다른 탭에서 같은 문제를 병행해 풀면 시각만으로 갈라낼 수
 * 없다. attempts 를 건드리지 않고 정확한 요약을 내기 위해 따로 쌓는다.
 */
export const solveRuns = pgTable("solve_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  departmentId: bigint("department_id", { mode: "number" }).notNull().references(() => departments.id),
  mode: varchar("mode", { length: 10 }).notNull(),
  problemIds: jsonb("problem_ids").$type<number[]>().notNull(),
  cursor: integer("cursor").notNull().default(0),
  results: jsonb("results").$type<{ problemId: number; correct: boolean | null }[]>()
    .notNull().default(sql`'[]'::jsonb`),
  status: varchar("status", { length: 20 }).notNull().default("IN_PROGRESS"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  modeCheck: check("solve_runs_mode_check", sql`${t.mode} IN ('ALL', 'WRONG')`),
  statusCheck: check("solve_runs_status_check", sql`${t.status} IN ('IN_PROGRESS', 'FINISHED')`),
  // 한 사람이 한 팀에 대해 진행 중인 바퀴는 최대 하나. 두 탭에서 동시에 시작해도
  // 바퀴가 둘로 갈라지지 않게 DB 가 막는다 — 애플리케이션 검사만으로는 경합을 못 막는다.
  oneActive: uniqueIndex("solve_runs_one_active").on(t.userId, t.departmentId)
    .where(sql`${t.status} = 'IN_PROGRESS'`),
}));
