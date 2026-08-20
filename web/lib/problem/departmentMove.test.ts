import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, problems, users } from "../db/schema";
import { insertProblem } from "../db/problems";
import type { AuthUser } from "../auth/types";

// 동시 이동 경합(정답지 C8)은 두 이동이 **같은 max 를 읽는** 순간을 재현해야 한다. 진짜
// 병렬 실행은 커넥션 큐 순서에 기대는 플레이키 테스트가 되므로, 그 한 줄만 고정값으로
// 바꿔치기한다. 기본값은 null 이고 그때는 실제 DAO 를 그대로 부른다.
const dbOverrides = vi.hoisted(() => ({ maxSourceNumber: null as number | null }));
vi.mock("../db/problems", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/problems")>();
  return {
    ...actual,
    findMaxSourceNumber: async (conn: never, departmentId: number) =>
      dbOverrides.maxSourceNumber ?? actual.findMaxSourceNumber(conn, departmentId),
  };
});

// eslint-disable-next-line import/first -- vi.mock 은 import 위로 호이스팅되므로 순서가 안전하다
import { changeProblemDepartment, nextSourceNumber } from "./departmentMove";

const db = testDb();
let deptA = 0, deptB = 0, inactiveDeptId = 0, superAdminId = 0, deptAdminId = 0;
let superAdmin: AuthUser;
let deptAdminOfA: AuthUser;

async function create(values: {
  dept: number; sourceNumber: number; status?: "ACTIVE" | "ARCHIVED";
}): Promise<number> {
  return insertProblem(db, {
    type: "OX", content: "본문", status: values.status ?? "ACTIVE",
    departmentId: values.dept, sourceNumber: values.sourceNumber, createdBy: superAdminId,
  });
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  dbOverrides.maxSourceNumber = null;
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: inactiveDeptId }] = await db.insert(departments).values({ name: "폐지팀", code: "Z", status: "INACTIVE" }).returning({ id: departments.id });
  [{ id: superAdminId }] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "a@b.c", passwordHash: "x",
    departmentId: deptA, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  [{ id: deptAdminId }] = await db.insert(users).values({
    employeeNo: "dept", name: "부서", email: "d@b.c", passwordHash: "x",
    departmentId: deptA, role: "DEPT_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  superAdmin = { userId: superAdminId, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: deptA, mustChangePassword: false };
  deptAdminOfA = { userId: deptAdminId, employeeNo: "dept", name: "부서", role: "DEPT_ADMIN", departmentId: deptA, mustChangePassword: false };
});

describe("changeProblemDepartment", () => {
  it("새 부서의 마지막+1 로 재부여한다", async () => {
    // 정답지 C7. 원래 번호를 들고 가면 대상 부서에 같은 번호가 있을 때 UNIQUE 에 걸린다.
    await create({ dept: deptB, sourceNumber: 5 });
    const id = await create({ dept: deptA, sourceNumber: 5 });
    expect(await changeProblemDepartment(db, id, deptB, superAdmin)).toBe(6);
    const [row] = await db.select().from(problems).where(eq(problems.id, id));
    expect(row.departmentId).toBe(deptB);
    expect(row.sourceNumber).toBe(6);
  });

  it("빈 부서로 옮기면 1 이다", async () => {
    const id = await create({ dept: deptA, sourceNumber: 9 });
    expect(await changeProblemDepartment(db, id, deptB, superAdmin)).toBe(1);
  });

  it("보관된 문제도 번호를 점유하므로 그 뒤를 잇는다", async () => {
    // 정답지 C7: findMaxSourceNumber 에 상태 조건이 없다(spec D5, 번호 재사용 금지).
    await create({ dept: deptB, sourceNumber: 7, status: "ARCHIVED" });
    const id = await create({ dept: deptA, sourceNumber: 1 });
    expect(await changeProblemDepartment(db, id, deptB, superAdmin)).toBe(8);
  });

  it("없는 문제를 막는다", async () => {
    // 정답지 C2 — R11(수정·보관·상세조회)과 같은 문구다.
    await expect(changeProblemDepartment(db, 999999, deptB, superAdmin))
      .rejects.toMatchObject({ message: "존재하지 않는 문제입니다." });
  });

  it("부서 미지정을 막는다", async () => {
    // 정답지 C3 — R8 의 "문제가 귀속될 부서를 선택하세요." 와 다른 문구다.
    const id = await create({ dept: deptA, sourceNumber: 1 });
    await expect(changeProblemDepartment(db, id, null, superAdmin))
      .rejects.toMatchObject({ message: "옮길 부서를 선택하세요." });
  });

  it("없는 부서를 막는다", async () => {
    const id = await create({ dept: deptA, sourceNumber: 1 });
    await expect(changeProblemDepartment(db, id, 999999, superAdmin))
      .rejects.toMatchObject({ message: "존재하지 않는 부서입니다." });
  });

  it("비활성 부서로는 옮길 수 없다", async () => {
    // 정답지 C5 — R10 의 "비활성 부서에는 문제를 등록할 수 없습니다: <부서명>" 과 다른 문구다.
    const id = await create({ dept: deptA, sourceNumber: 1 });
    await expect(changeProblemDepartment(db, id, inactiveDeptId, superAdmin))
      .rejects.toMatchObject({ message: "비활성 부서로는 옮길 수 없습니다: 폐지팀" });
  });

  it("같은 부서로 옮기면 거절한다", async () => {
    // 정답지 C6. 막지 않으면 findMaxSourceNumber 가 자기 행까지 세어 번호가 1씩 밀린다.
    const id = await create({ dept: deptA, sourceNumber: 3 });
    await expect(changeProblemDepartment(db, id, deptA, superAdmin))
      .rejects.toMatchObject({ message: "이미 가팀 소속입니다." });
    const [row] = await db.select().from(problems).where(eq(problems.id, id));
    expect(row.sourceNumber).toBe(3); // 조용한 no-op 이 아니라 거절이므로 번호도 그대로다
  });

  it("가드 순서: 없는 문제가 부서 검증보다 먼저다", async () => {
    // 순서를 뒤집으면 없는 문제 + 없는 부서 요청에 "존재하지 않는 부서입니다." 가 나간다.
    await expect(changeProblemDepartment(db, 999999, 999999, superAdmin))
      .rejects.toMatchObject({ message: "존재하지 않는 문제입니다." });
  });

  it("동시 이동 경합은 중복 문항번호 안내로 번역된다", async () => {
    // 정답지 C8: 두 이동이 같은 max 를 읽고 같은 번호를 쓴다. 진 쪽은 -1 "처리 중 오류가
    // 발생하였습니다." 가 아니라 등록·수정과 같은 한국어 안내를 받아야 한다. 부서명은 이미
    // 손에 있는 문자열로 넘긴다 — catch 안에서 SELECT 하면 25P02 로 트랜잭션이 abort 된다.
    //
    // 경합을 인위적으로 만든다: findMaxSourceNumber 를 고정값으로 세워 두 번째 이동이
    // 첫 번째와 같은 번호를 쓰게 한다(진짜 동시 실행은 타이밍에 기대는 플레이키 테스트가 된다).
    await create({ dept: deptB, sourceNumber: 4 });
    const loser = await create({ dept: deptA, sourceNumber: 1 });
    dbOverrides.maxSourceNumber = 4; // 이미 4번이 있는데도 4 를 읽은 패자 → assigned 5 가 아닌 5…
    await db.insert(problems).values({
      type: "OX", content: "선점", status: "ACTIVE", departmentId: deptB,
      sourceNumber: 5, createdBy: superAdminId,
    });
    await expect(changeProblemDepartment(db, loser, deptB, superAdmin))
      .rejects.toMatchObject({ message: "나팀 5번은 이미 있습니다. 다른 번호를 입력하세요." });
    // 번역이 DB 를 다시 건드리지 않았음을 확인한다(재조회면 25P02 로 다른 예외가 났을 것).
    const [row] = await db.select().from(problems).where(eq(problems.id, loser));
    expect(row.departmentId).toBe(deptA);
  });

  it("성공하면 감사 로그를 남긴다", async () => {
    // 정답지 A4·C9.
    const id = await create({ dept: deptA, sourceNumber: 3 });
    const assigned = await changeProblemDepartment(db, id, deptB, superAdmin);
    const rows = await db.select().from(auditLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("PROBLEM_DEPARTMENT_CHANGED");
    expect(rows[0].targetType).toBe("PROBLEM");
    expect(rows[0].targetId).toBe(id);
    expect(rows[0].detail).toEqual({ from: deptA, to: deptB, sourceNumberFrom: 3, sourceNumberTo: assigned });
  });
});

describe("nextSourceNumber", () => {
  it("빈 부서는 1 이다", async () => {
    expect(await nextSourceNumber(db, deptB, superAdmin)).toBe(1);
  });

  it("보관 문제도 세어 마지막+1 을 준다", async () => {
    // 정답지 C7·C11: findMaxSourceNumber 에 상태 조건이 없다.
    await create({ dept: deptA, sourceNumber: 9, status: "ARCHIVED" });
    expect(await nextSourceNumber(db, deptA, superAdmin)).toBe(10);
  });

  it("부서 관리자의 요청 부서를 무시한다", async () => {
    // 정답지 R5·C11: 쓰기 경로의 부서 관문(resolveOwningDepartment)을 그대로 쓴다.
    await create({ dept: deptA, sourceNumber: 4 });
    await create({ dept: deptB, sourceNumber: 40 });
    expect(await nextSourceNumber(db, deptB, deptAdminOfA)).toBe(5);
  });

  it("총괄 관리자가 부서를 안 주면 막는다", async () => {
    await expect(nextSourceNumber(db, null, superAdmin))
      .rejects.toMatchObject({ message: "문제가 귀속될 부서를 선택하세요." });
  });

  it("총괄 관리자의 비활성 부서 요청을 막는다", async () => {
    await expect(nextSourceNumber(db, inactiveDeptId, superAdmin))
      .rejects.toMatchObject({ message: "비활성 부서에는 문제를 등록할 수 없습니다: 폐지팀" });
  });
});
