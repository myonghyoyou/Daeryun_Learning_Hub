import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { asc, eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import {
  attempts, departments, problemBlanks, problemChoices, problemTags, problems, tags, users,
} from "../db/schema";
import { SNAPSHOT_VERSION, type ProblemSnapshot, type SnapshotDepartment, type SnapshotProblem } from "./snapshot";
import { importSnapshot } from "./importSnapshot";

const db = testDb();
let deptId = 0;
let adminId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "개발팀", code: "DEV", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: adminId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

function problemOf(over: Partial<SnapshotProblem> = {}): SnapshotProblem {
  return {
    id: 501, type: "MCQ_SINGLE", content: "본문", imageUrl: null, referenceText: null,
    explanation: null, blankRevealCount: null, status: "ACTIVE", departmentCode: "DEV",
    sourceNumber: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    choices: [], answers: [], blanks: [], tags: [], ...over,
  };
}

function snapshotOf(
  problemList: SnapshotProblem[],
  departmentList: SnapshotDepartment[] = [{ code: "DEV", name: "개발팀", status: "ACTIVE" }],
): ProblemSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: "2026-09-01T00:00:00.000Z",
    source: { host: "prod.example.com", database: "postgres" },
    counts: { departments: departmentList.length, problems: problemList.length, tags: 0 },
    departments: departmentList,
    problems: problemList,
  };
}

/** 로컬에 기존 문제 1개와 그 문제를 참조하는 풀이 이력 1건을 심는다. */
async function seedExistingProblemWithAttempt() {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "기존 문제", departmentId: deptId, status: "ACTIVE",
    createdBy: adminId, sourceNumber: 99,
  }).returning({ id: problems.id });
  await db.insert(attempts).values({
    userId: adminId, problemId: row.id, submittedAnswer: "O", isCorrect: true,
  });
  return row.id;
}

describe("importSnapshot", () => {
  it("기존 문제와 풀이 이력을 지우고 스냅샷 내용으로 교체한다", async () => {
    const oldId = await seedExistingProblemWithAttempt();

    const result = await importSnapshot(db, snapshotOf([problemOf()]));

    expect(result.deletedAttempts).toBe(1);
    expect(result.deletedProblems).toBe(1);
    expect(result.insertedProblems).toBe(1);
    expect(await db.select().from(attempts)).toEqual([]);
    const rows = await db.select({ id: problems.id, content: problems.content }).from(problems);
    expect(rows).toEqual([{ id: 501, content: "본문" }]);
    expect(rows.some((r) => r.id === oldId)).toBe(false);
  });

  it("운영과 같은 문제 번호로 넣는다 — 자동 번호를 새로 받지 않는다", async () => {
    await importSnapshot(db, snapshotOf([problemOf({ id: 1234 })]));
    const [row] = await db.select({ id: problems.id }).from(problems);
    expect(row.id).toBe(1234);
  });

  it("로컬에 없는 부서는 만들고, 이미 있는 부서의 이름·상태는 건드리지 않는다", async () => {
    const result = await importSnapshot(db, snapshotOf(
      [problemOf({ departmentCode: "CONST" })],
      [
        // 로컬 DEV 는 ACTIVE 다. 스냅샷이 INACTIVE 라고 해도 덮어쓰면 안 된다.
        { code: "DEV", name: "다른이름", status: "INACTIVE" },
        { code: "CONST", name: "공사관리팀", status: "ACTIVE" },
      ],
    ));

    expect(result.createdDepartments).toBe(1);
    const [dev] = await db.select().from(departments).where(eq(departments.code, "DEV"));
    expect(dev.name).toBe("개발팀");
    expect(dev.status).toBe("ACTIVE");
    const [construction] = await db.select().from(departments).where(eq(departments.code, "CONST"));
    expect(construction.name).toBe("공사관리팀");
  });

  it("운영에서 INACTIVE 인 부서는 그 상태 그대로 만든다", async () => {
    await importSnapshot(db, snapshotOf(
      [problemOf({ departmentCode: "GONE" })],
      [{ code: "DEV", name: "개발팀", status: "ACTIVE" }, { code: "GONE", name: "폐지팀", status: "INACTIVE" }],
    ));
    const [gone] = await db.select().from(departments).where(eq(departments.code, "GONE"));
    expect(gone.status).toBe("INACTIVE");
  });

  it("보기와 빈칸의 표시 순서를 원본 그대로 넣는다 — 1..n 으로 다시 매기지 않는다", async () => {
    await importSnapshot(db, snapshotOf([problemOf({
      type: "FILL_BLANK",
      blankRevealCount: 2,
      choices: [
        { choiceText: "나중", isCorrect: false, displayOrder: 9 },
        { choiceText: "먼저", isCorrect: true, displayOrder: 5 },
      ],
      blanks: [
        { blankKey: "b", answerText: "둘", displayOrder: 7 },
        { blankKey: "a", answerText: "하나", displayOrder: 3 },
      ],
    })]));

    const choiceRows = await db.select({ text: problemChoices.choiceText, order: problemChoices.displayOrder })
      .from(problemChoices).orderBy(asc(problemChoices.displayOrder));
    expect(choiceRows).toEqual([{ text: "먼저", order: 5 }, { text: "나중", order: 9 }]);

    const blankRows = await db.select({ key: problemBlanks.blankKey, order: problemBlanks.displayOrder })
      .from(problemBlanks).orderBy(asc(problemBlanks.displayOrder));
    expect(blankRows).toEqual([{ key: "a", order: 3 }, { key: "b", order: 7 }]);
  });

  it("태그는 이름으로 맞춰 붙이고, 여러 문제가 같은 태그를 써도 하나만 만든다", async () => {
    await importSnapshot(db, snapshotOf([
      problemOf({ id: 1, sourceNumber: 1, tags: ["안전", "법규"] }),
      problemOf({ id: 2, sourceNumber: 2, tags: ["안전"] }),
    ]));

    expect((await db.select().from(tags)).length).toBe(2);
    expect((await db.select().from(problemTags)).length).toBe(3);
  });

  it("들여온 뒤 새 문제를 만들어도 번호가 충돌하지 않는다 — 번호표를 되돌린다", async () => {
    await importSnapshot(db, snapshotOf([problemOf({ id: 900 })]));

    // 번호표를 되돌리지 않으면 자동 번호가 1 부터 나와 기존 id 와 부딪힌다.
    const [created] = await db.insert(problems).values({
      type: "OX", content: "새 문제", departmentId: deptId, status: "ACTIVE",
      createdBy: adminId, sourceNumber: 777,
    }).returning({ id: problems.id });
    expect(created.id).toBeGreaterThan(900);
  });

  it("총괄관리자가 없으면 안내와 함께 멈춘다", async () => {
    await db.delete(users);
    await expect(importSnapshot(db, snapshotOf([problemOf()]))).rejects.toThrow(/SUPER_ADMIN/);
  });

  it("작성자는 로컬 총괄관리자로 채운다 — 운영 작성자는 옮기지 않는다", async () => {
    await importSnapshot(db, snapshotOf([problemOf()]));
    const [row] = await db.select({ createdBy: problems.createdBy }).from(problems);
    expect(row.createdBy).toBe(adminId);
  });
});
