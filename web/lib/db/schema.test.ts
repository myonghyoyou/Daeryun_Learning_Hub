import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users, problems } from "./schema";

const db = testDb();

beforeAll(async () => {
  await migrateTestDb();
});
beforeEach(async () => {
  await truncateAll();
});

describe("schema round-trip", () => {
  it("inserts and reads a department", async () => {
    const [row] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
    expect(row.status).toBe("ACTIVE"); // 기본값
    const found = await db.select().from(departments).where(eq(departments.id, row.id));
    expect(found[0].name).toBe("본사");
  });

  it("enforces the unique department code", async () => {
    await db.insert(departments).values({ name: "A", code: "DUP" });
    await expect(db.insert(departments).values({ name: "B", code: "DUP" })).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces unique (department_id, source_number) on problems", async () => {
    const [dept] = await db.insert(departments).values({ name: "부서", code: "D1" }).returning();
    const [admin] = await db.insert(users).values({
      employeeNo: "A1", name: "관리", email: "a1@x.local", passwordHash: "h",
      departmentId: dept.id, role: "SUPER_ADMIN",
    }).returning();
    const base = { type: "SHORT_ANSWER" as const, content: "q", departmentId: dept.id, createdBy: admin.id, sourceNumber: 7 };
    await db.insert(problems).values(base);
    await expect(
      db.insert(problems).values({ ...base, content: "q2" }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});

describe("problems.track", () => {
  async function makeOwner() {
    const [dept] = await db.insert(departments)
      .values({ name: "직군부서", code: "TRK" }).returning();
    const [admin] = await db.insert(users).values({
      employeeNo: "trk-admin", name: "관리자", email: "trk@x.local", passwordHash: "h",
      departmentId: dept.id, role: "SUPER_ADMIN",
    }).returning();
    return { departmentId: dept.id, createdBy: admin.id };
  }

  it("안 넘기면 행정직으로 들어간다", async () => {
    const owner = await makeOwner();
    const [row] = await db.insert(problems)
      .values({ type: "OX", content: "본문", ...owner })
      .returning({ track: problems.track });
    expect(row.track).toBe("ADMIN");
  });

  it("기술직으로 넣으면 그대로 저장된다", async () => {
    const owner = await makeOwner();
    const [row] = await db.insert(problems)
      .values({ type: "OX", content: "본문", track: "TECH", ...owner })
      .returning({ track: problems.track });
    expect(row.track).toBe("TECH");
  });

  // 두 값 밖은 CHECK 제약이 막는다 — 애플리케이션 검증이 없어도 DB 가 지키는지 본다.
  it("두 값 밖은 DB 가 거절한다", async () => {
    const owner = await makeOwner();
    await expect(db.insert(problems).values({
      type: "OX", content: "본문", track: "SALES", ...owner,
    })).rejects.toThrow();
  });
});
