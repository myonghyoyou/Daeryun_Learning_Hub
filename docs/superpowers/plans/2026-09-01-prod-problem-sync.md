# 운영 문제 → 로컬 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 DB의 문제 데이터를 로컬 개발 DB로 옮기는 반복 실행 가능한 명령어를 만든다 — 로컬을 운영의 사본으로 만들어, 실제와 같은 데이터로 화면·검색·랜덤 출제·통계를 확인할 수 있게 한다.

**Architecture:** 내보내기와 들여오기를 분리한다. `export`는 운영 DB를 읽기 전용 트랜잭션으로 읽어 JSON 스냅샷 파일 하나를 만들고, `import`는 그 파일로 로컬의 문제를 통째로 교체한다. 나누는 이유는 테스트다 — 까다로운 절반(기존 데이터 삭제, 부서 짝맞추기, 번호표 되돌리기)을 픽스처 스냅샷만으로 전부 검증할 수 있다. 부서는 내부 번호가 아니라 **부서 코드**로 짝을 맞춘다(운영과 로컬은 번호가 다르다).

**Tech Stack:** TypeScript, tsx(스크립트 실행), Drizzle ORM, postgres.js, Vitest

**Spec:** `docs/superpowers/specs/2026-09-01-prod-problem-sync-design.md`

## Global Constraints

- **운영 쪽은 쓰기가 물리적으로 불가능해야 한다.** 모든 운영 조회는 `sql.begin("read only", ...)` 안에서 한다. "쓰지 않기로 한다"가 아니라 Postgres가 거부하게 만든다.
- **들여오기는 로컬에서만 돌아야 한다.** 기존 `assertSeedableEnvironment`(`web/lib/devSeed.ts`)를 **재사용한다** — 새로 만들지 않는다.
- **운영 직원 계정은 읽지도 저장하지도 않는다.** 스냅샷에 `createdBy`를 담지 않고, 들여올 때 로컬 총괄관리자로 대체한다.
- **`getDb()`(`web/lib/db/client.ts`)를 쓰지 않는 곳이 있다.** 이 함수는 연결을 하나만 캐시하는 구조라 운영·로컬 두 곳에 동시에 붙을 수 없다. 내보내기는 `postgres(url, { prepare: false })`로 직접 연다(Supabase 풀러에 `prepare: false`는 필수다). 들여오기는 로컬 한 곳만 쓰므로 `getDb()`를 그대로 쓴다.
- **`insertDepartment`(`web/lib/db/departments.ts:22`)를 쓰지 않는다.** 이 함수는 `status`를 항상 `"ACTIVE"`로 박는다. 운영에서 `INACTIVE`인 부서를 그대로 옮기려면 직접 넣어야 한다.
- **`insertChoices`·`insertBlanks`(`web/lib/db/problemParts.ts:11,21`)를 쓰지 않는다.** 두 함수는 배열 순서로 `displayOrder`를 1..n으로 **다시 매긴다.** 원본 표시 순서를 그대로 옮겨야 하므로 직접 넣는다. (`insertAnswers`는 `displayOrder`가 없어 무관하지만, 일관성을 위해 세 가지 모두 직접 넣는다.)
- **테스트는 한 러너(vitest)로 모은다.** `web/vitest.config.ts`가 `fileParallelism: false`로 돌린다(통합 테스트가 `probank_test` DB 하나를 공유한다). 매 태스크 끝에 전체 스위트를 돌려 무회귀를 확인한다.
- **새 회귀 테스트는 뮤테이션으로 검증한다.** 테스트를 추가했으면 방금 만든 분기를 일부러 망가뜨려 그 테스트가 실제로 실패하는지 확인한 뒤 복원한다.
- **커밋은 태스크 단위.** `docs/**`·`.claude/**`는 사용자 승인 없이 스테이징하지 않는다.
- **`bigint` 컬럼은 SQL에서 `::int`로 캐스팅해 읽는다.** postgres.js는 `int8`을 문자열로 돌려줄 수 있어, 캐스팅하지 않으면 스냅샷의 `id`가 숫자가 아니라 문자열이 된다.

---

## 파일 구성

| 파일 | 책임 |
|---|---|
| `web/lib/problemSync/snapshot.ts` | 스냅샷 타입·버전·저장 경로, `parseSnapshot` 형식 검증 (순수) |
| `web/lib/problemSync/importSnapshot.ts` | 스냅샷으로 로컬 문제를 교체 (트랜잭션 1개) |
| `web/lib/problemSync/exportSnapshot.ts` | 운영 접속 검증, 조회 결과 → 스냅샷 변환(순수), 운영 조회 |
| `web/scripts/sync-problems-export.ts` | `export` 진입점 |
| `web/scripts/sync-problems-import.ts` | `import` 진입점 |

---

### Task 1: 스냅샷 형식과 검증

**Files:**
- Create: `web/lib/problemSync/snapshot.ts`
- Test: `web/lib/problemSync/snapshot.test.ts`

**Interfaces:**
- Consumes: 없음(최하위, DB를 쓰지 않는 순수 모듈)
- Produces: 타입 `ProblemSnapshot`·`SnapshotDepartment`·`SnapshotProblem`·`SnapshotChoice`·`SnapshotAnswer`·`SnapshotBlank`, 상수 `SNAPSHOT_VERSION = 1`·`SNAPSHOT_PATH = ".data/prod-problems.json"`, 함수 `parseSnapshot(raw: unknown): ProblemSnapshot`. Task 2·3·4가 전부 이것을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problemSync/snapshot.test.ts` 새로 작성:

```typescript
import { describe, it, expect } from "vitest";
import { parseSnapshot, SNAPSHOT_VERSION, type ProblemSnapshot } from "./snapshot";

function validSnapshot(): ProblemSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: "2026-09-01T00:00:00.000Z",
    source: { host: "prod.example.com", database: "postgres" },
    counts: { departments: 1, problems: 1, tags: 1 },
    departments: [{ code: "DEV", name: "개발팀", status: "ACTIVE" }],
    problems: [{
      id: 501, type: "MCQ_SINGLE", content: "본문", imageUrl: null, referenceText: null,
      explanation: null, blankRevealCount: null, status: "ACTIVE", departmentCode: "DEV",
      sourceNumber: 3, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      choices: [{ choiceText: "가", isCorrect: true, displayOrder: 1 }],
      answers: [{ answerText: "가" }],
      blanks: [{ blankKey: "a", answerText: "가", displayOrder: 1 }],
      tags: ["안전"],
    }],
  };
}

describe("parseSnapshot", () => {
  it("올바른 스냅샷은 그대로 통과한다", () => {
    const snapshot = validSnapshot();
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("버전이 다르면 거부한다 — 형식이 바뀐 파일을 절반만 읽는 것보다 멈추는 게 낫다", () => {
    const bad = { ...validSnapshot(), version: 99 };
    expect(() => parseSnapshot(bad)).toThrow(/version/);
  });

  it("객체가 아니면 거부한다", () => {
    expect(() => parseSnapshot("문자열")).toThrow(/최상위/);
    expect(() => parseSnapshot(null)).toThrow(/최상위/);
  });

  it("필수 항목이 빠지면 어느 자리인지 알려준다", () => {
    const bad = validSnapshot() as unknown as Record<string, unknown>;
    delete (bad.problems as Record<string, unknown>[])[0].content;
    expect(() => parseSnapshot(bad)).toThrow(/problems\[0\]\.content/);
  });

  it("숫자 자리에 문자열이 오면 거부한다 — id 가 문자열로 새는 것을 여기서 잡는다", () => {
    const bad = validSnapshot() as unknown as { problems: Record<string, unknown>[] };
    bad.problems[0].id = "501";
    expect(() => parseSnapshot(bad)).toThrow(/problems\[0\]\.id/);
  });

  it("문제가 가리키는 부서 코드가 목록에 없으면 거부한다", () => {
    const bad = validSnapshot();
    bad.problems[0].departmentCode = "NOPE";
    expect(() => parseSnapshot(bad)).toThrow(/NOPE/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/snapshot.test.ts`
Expected: FAIL — `./snapshot` 모듈이 없어 import 에러.

- [ ] **Step 3: 구현한다**

`web/lib/problemSync/snapshot.ts` 새로 작성:

```typescript
// 운영 → 로컬 문제 동기화가 주고받는 스냅샷 파일의 형식과 검증.
// scripts/sync-problems-export.ts 가 만들고 scripts/sync-problems-import.ts 가 읽는다.
//
// 사람 정보는 담지 않는다 — 운영 작성자(created_by)는 옮기지 않고, 들여올 때 로컬
// 총괄관리자로 대체한다(설계 문서 "안전장치" 참고).

export const SNAPSHOT_VERSION = 1;

// scripts 는 web/ 를 작업 디렉터리로 실행된다. .data/ 는 .gitignore 대상이다.
export const SNAPSHOT_PATH = ".data/prod-problems.json";

export type SnapshotDepartment = { code: string; name: string; status: string };
export type SnapshotChoice = { choiceText: string; isCorrect: boolean; displayOrder: number };
export type SnapshotAnswer = { answerText: string };
export type SnapshotBlank = { blankKey: string; answerText: string; displayOrder: number };

export type SnapshotProblem = {
  id: number;
  type: string;
  content: string;
  imageUrl: string | null;
  referenceText: string | null;
  explanation: string | null;
  blankRevealCount: number | null;
  status: string;
  // 부서를 번호가 아니라 코드로 적는다. 운영과 로컬은 부서의 내부 번호가 서로 달라서,
  // 번호를 그대로 옮기면 문제가 엉뚱한 부서에 붙는다.
  departmentCode: string;
  sourceNumber: number | null;
  createdAt: string;
  updatedAt: string;
  choices: SnapshotChoice[];
  answers: SnapshotAnswer[];
  blanks: SnapshotBlank[];
  tags: string[];
};

export type ProblemSnapshot = {
  version: number;
  generatedAt: string;
  source: { host: string; database: string };
  counts: { departments: number; problems: number; tags: number };
  departments: SnapshotDepartment[];
  problems: SnapshotProblem[];
};

function fail(message: string): never {
  throw new Error(`스냅샷 형식이 올바르지 않습니다: ${message}`);
}

function asRecord(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${at} 가 객체가 아닙니다.`);
  return value as Record<string, unknown>;
}

function asArray(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) fail(`${at} 가 배열이 아닙니다.`);
  return value;
}

function asString(value: unknown, at: string): string {
  if (typeof value !== "string") fail(`${at} 가 문자열이 아닙니다.`);
  return value;
}

function asNullableString(value: unknown, at: string): string | null {
  return value === null ? null : asString(value, at);
}

function asNumber(value: unknown, at: string): number {
  // "501" 같은 문자열을 통과시키면 문제 번호가 문자열로 새어 들어간다 — postgres.js 가
  // int8 을 문자열로 돌려주는 경우를 여기서 잡는다.
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${at} 가 숫자가 아닙니다.`);
  return value;
}

function asNullableNumber(value: unknown, at: string): number | null {
  return value === null ? null : asNumber(value, at);
}

function asBoolean(value: unknown, at: string): boolean {
  if (typeof value !== "boolean") fail(`${at} 가 참/거짓이 아닙니다.`);
  return value;
}

/**
 * 파일에서 읽은 값을 검증해 스냅샷으로 만든다. 어긋나면 어느 자리가 잘못됐는지 밝혀 던진다.
 *
 * 들여오기는 기존 문제와 풀이 이력을 전부 지우고 시작한다 — 절반쯤 읽다가 중간에 터지면
 * 로컬이 빈 채로 남는다. 그래서 DB 를 건드리기 전에 파일 전체를 여기서 먼저 검증한다.
 */
export function parseSnapshot(raw: unknown): ProblemSnapshot {
  const root = asRecord(raw, "최상위");

  const version = asNumber(root.version, "version");
  if (version !== SNAPSHOT_VERSION) {
    fail(`version 이 ${SNAPSHOT_VERSION} 이 아닙니다(받은 값: ${version}). 내보내기를 다시 실행하세요.`);
  }

  const source = asRecord(root.source, "source");
  const counts = asRecord(root.counts, "counts");

  const departments = asArray(root.departments, "departments").map((d, i) => {
    const rec = asRecord(d, `departments[${i}]`);
    return {
      code: asString(rec.code, `departments[${i}].code`),
      name: asString(rec.name, `departments[${i}].name`),
      status: asString(rec.status, `departments[${i}].status`),
    };
  });

  const problems = asArray(root.problems, "problems").map((p, i) => {
    const at = `problems[${i}]`;
    const rec = asRecord(p, at);
    return {
      id: asNumber(rec.id, `${at}.id`),
      type: asString(rec.type, `${at}.type`),
      content: asString(rec.content, `${at}.content`),
      imageUrl: asNullableString(rec.imageUrl, `${at}.imageUrl`),
      referenceText: asNullableString(rec.referenceText, `${at}.referenceText`),
      explanation: asNullableString(rec.explanation, `${at}.explanation`),
      blankRevealCount: asNullableNumber(rec.blankRevealCount, `${at}.blankRevealCount`),
      status: asString(rec.status, `${at}.status`),
      departmentCode: asString(rec.departmentCode, `${at}.departmentCode`),
      sourceNumber: asNullableNumber(rec.sourceNumber, `${at}.sourceNumber`),
      createdAt: asString(rec.createdAt, `${at}.createdAt`),
      updatedAt: asString(rec.updatedAt, `${at}.updatedAt`),
      choices: asArray(rec.choices, `${at}.choices`).map((c, j) => {
        const cr = asRecord(c, `${at}.choices[${j}]`);
        return {
          choiceText: asString(cr.choiceText, `${at}.choices[${j}].choiceText`),
          isCorrect: asBoolean(cr.isCorrect, `${at}.choices[${j}].isCorrect`),
          displayOrder: asNumber(cr.displayOrder, `${at}.choices[${j}].displayOrder`),
        };
      }),
      answers: asArray(rec.answers, `${at}.answers`).map((a, j) => ({
        answerText: asString(asRecord(a, `${at}.answers[${j}]`).answerText, `${at}.answers[${j}].answerText`),
      })),
      blanks: asArray(rec.blanks, `${at}.blanks`).map((b, j) => {
        const br = asRecord(b, `${at}.blanks[${j}]`);
        return {
          blankKey: asString(br.blankKey, `${at}.blanks[${j}].blankKey`),
          answerText: asString(br.answerText, `${at}.blanks[${j}].answerText`),
          displayOrder: asNumber(br.displayOrder, `${at}.blanks[${j}].displayOrder`),
        };
      }),
      tags: asArray(rec.tags, `${at}.tags`).map((t, j) => asString(t, `${at}.tags[${j}]`)),
    };
  });

  // 문제가 가리키는 부서 코드가 목록에 없으면 들여오기가 중간에 죽는다. 파일을 읽는 시점에 잡는다.
  const codes = new Set(departments.map((d) => d.code));
  for (const problem of problems) {
    if (!codes.has(problem.departmentCode)) {
      fail(`문제 ${problem.id} 의 부서 코드 ${problem.departmentCode} 가 departments 목록에 없습니다.`);
    }
  }

  return {
    version,
    generatedAt: asString(root.generatedAt, "generatedAt"),
    source: {
      host: asString(source.host, "source.host"),
      database: asString(source.database, "source.database"),
    },
    counts: {
      departments: asNumber(counts.departments, "counts.departments"),
      problems: asNumber(counts.problems, "counts.problems"),
      tags: asNumber(counts.tags, "counts.tags"),
    },
    departments,
    problems,
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/snapshot.test.ts`
Expected: PASS, 6개 전부.

- [ ] **Step 5: 뮤테이션 테스트**

`asNumber`의 `typeof value !== "number"` 조건을 잠시 `false`로 바꿔 저장 → 재실행 → "숫자 자리에 문자열" 테스트가 실패하는지 확인 → 복원 → 다시 통과 확인.

- [ ] **Step 6: 전체 스위트 확인 + 커밋**

```bash
cd web && npx vitest run
```

```bash
git add web/lib/problemSync/snapshot.ts web/lib/problemSync/snapshot.test.ts
git commit -m "[ADD] 문제 동기화 스냅샷 형식과 검증"
```

---

### Task 2: 들여오기 로직

**Files:**
- Create: `web/lib/problemSync/importSnapshot.ts`
- Test: `web/lib/problemSync/importSnapshot.test.ts`

**Interfaces:**
- Consumes: `ProblemSnapshot`·`SNAPSHOT_VERSION`(Task 1), `findOrCreateTagsByNames(db: DbConn, names: string[]): Promise<number[]>`(`web/lib/db/tags.ts:29`), 스키마 테이블(`web/lib/db/schema.ts`)
- Produces: `importSnapshot(db: Db, snapshot: ProblemSnapshot): Promise<ImportResult>`, 타입 `ImportResult = { deletedAttempts: number; deletedProblems: number; createdDepartments: number; insertedProblems: number }`. Task 4의 진입점이 호출한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problemSync/importSnapshot.test.ts` 새로 작성. 기존 `web/lib/db/attempts.test.ts`의 `beforeAll`/`beforeEach` 패턴을 그대로 따른다:

```typescript
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/importSnapshot.test.ts`
Expected: FAIL — `./importSnapshot` 모듈이 없어 import 에러.

- [ ] **Step 3: 구현한다**

`web/lib/problemSync/importSnapshot.ts` 새로 작성:

```typescript
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  attempts, departments, problemAnswers, problemBlanks, problemChoices, problemTags, problems, tags, users,
} from "../db/schema";
import { findOrCreateTagsByNames } from "../db/tags";
import type { ProblemSnapshot } from "./snapshot";

export type ImportResult = {
  deletedAttempts: number;
  deletedProblems: number;
  createdDepartments: number;
  insertedProblems: number;
};

/**
 * 스냅샷으로 로컬 DB 의 문제를 통째로 교체한다.
 *
 * **첫 인자가 `Db` 다 — `DbConn` 이 아니다.** 이 함수가 트랜잭션을 연다. 이미 열린 핸들을
 * 받으면 Drizzle 이 SAVEPOINT 로 중첩시켜 "전부 되거나 전부 안 되거나"가 깨진다
 * (lib/solve/attemptService.ts 가 같은 이유로 같은 규칙을 쓴다).
 *
 * **호출 전에 반드시 assertSeedableEnvironment(lib/devSeed.ts)로 로컬 DB 인지 확인해야 한다.**
 * 이 함수는 기존 문제와 풀이 이력을 전부 지운다.
 */
export async function importSnapshot(db: Db, snapshot: ProblemSnapshot): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    // 1. 풀이 이력 먼저. attempts.problem_id 에는 연쇄 삭제가 걸려 있지 않아, 이력이 남아 있으면
    //    DB 가 문제 삭제를 거부한다. attempt_choices·attempt_blank_answers 는 attempts 에
    //    연쇄 삭제가 걸려 있어 함께 사라진다.
    const deletedAttempts = (await tx.delete(attempts).returning({ id: attempts.id })).length;

    // 2. 문제. 보기·정답·빈칸·문제태그는 problems 에 연쇄 삭제가 걸려 있어 함께 사라진다.
    const deletedProblems = (await tx.delete(problems).returning({ id: problems.id })).length;

    // 3. 부서를 코드로 맞춘다. 이미 있으면 이름·상태를 건드리지 않는다 — 로컬에는 검증용으로
    //    상태를 바꿔 둔 부서가 있을 수 있다(scripts/seed-dev.ts 와 같은 규칙).
    //    lib/db/departments.ts 의 insertDepartment 를 쓰지 않는 이유: 그 함수는 status 를
    //    항상 ACTIVE 로 박아, 운영에서 INACTIVE 인 부서를 그대로 옮길 수 없다.
    const departmentIdByCode = new Map<string, number>();
    let createdDepartments = 0;
    for (const dept of snapshot.departments) {
      const [found] = await tx.select({ id: departments.id }).from(departments)
        .where(eq(departments.code, dept.code));
      if (found) {
        departmentIdByCode.set(dept.code, found.id);
        continue;
      }
      const [created] = await tx.insert(departments)
        .values({ name: dept.name, code: dept.code, status: dept.status })
        .returning({ id: departments.id });
      departmentIdByCode.set(dept.code, created.id);
      createdDepartments++;
    }

    // 4. 작성자. 운영 작성자 계정은 옮기지 않으므로 로컬 총괄관리자로 대체한다.
    const [admin] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.role, "SUPER_ADMIN")).orderBy(asc(users.id)).limit(1);
    if (!admin) {
      throw new Error(
        "로컬에 SUPER_ADMIN 계정이 없습니다. pnpm bootstrap 또는 pnpm seed:dev 를 먼저 실행하세요.",
      );
    }

    // 5. 태그를 한 번에 맞춘다. 문제마다 부르면 700문항에 1,400번 왕복한다.
    //    findOrCreateTagsByNames 는 id 배열만 돌려주고 이름 대응을 알려주지 않으므로,
    //    만든 뒤 이름으로 다시 읽어 짝을 만든다.
    const tagNames = [...new Set(snapshot.problems.flatMap((p) => p.tags))];
    const tagIdByName = new Map<string, number>();
    if (tagNames.length > 0) {
      await findOrCreateTagsByNames(tx, tagNames);
      const rows = await tx.select({ id: tags.id, name: tags.name }).from(tags)
        .where(inArray(tags.name, tagNames));
      for (const row of rows) tagIdByName.set(row.name, row.id);
    }

    // 6. 문제와 딸린 것들.
    for (const problem of snapshot.problems) {
      // id 를 명시해 넣는다 — 운영과 같은 번호를 유지해야 "운영 512번"이 로컬에서도 512번이다.
      await tx.insert(problems).values({
        id: problem.id,
        type: problem.type,
        content: problem.content,
        imageUrl: problem.imageUrl,
        referenceText: problem.referenceText,
        explanation: problem.explanation,
        blankRevealCount: problem.blankRevealCount,
        status: problem.status,
        departmentId: departmentIdByCode.get(problem.departmentCode)!,
        sourceNumber: problem.sourceNumber,
        createdBy: admin.id,
        createdAt: new Date(problem.createdAt),
        updatedAt: new Date(problem.updatedAt),
      });

      // displayOrder 를 원본 그대로 넣는다. lib/db/problemParts.ts 의 insertChoices·insertBlanks 는
      // 배열 순서로 1..n 을 다시 매기므로 여기서는 쓰지 않는다.
      if (problem.choices.length > 0) {
        await tx.insert(problemChoices).values(problem.choices.map((c) => ({
          problemId: problem.id, choiceText: c.choiceText, isCorrect: c.isCorrect, displayOrder: c.displayOrder,
        })));
      }
      if (problem.answers.length > 0) {
        await tx.insert(problemAnswers).values(problem.answers.map((a) => ({
          problemId: problem.id, answerText: a.answerText,
        })));
      }
      if (problem.blanks.length > 0) {
        await tx.insert(problemBlanks).values(problem.blanks.map((b) => ({
          problemId: problem.id, blankKey: b.blankKey, answerText: b.answerText, displayOrder: b.displayOrder,
        })));
      }
      if (problem.tags.length > 0) {
        await tx.insert(problemTags).values(problem.tags.map((name) => ({
          problemId: problem.id, tagId: tagIdByName.get(name)!,
        })));
      }
    }

    // 7. 번호표를 되돌린다. id 를 명시해 넣으면 시퀀스가 그대로라, 다음에 문제를 새로 만들 때
    //    이미 쓰인 번호를 발급하려다 기본키 충돌로 죽는다.
    await tx.execute(sql`
      SELECT setval(pg_get_serial_sequence('problems', 'id'),
                    GREATEST((SELECT COALESCE(MAX(id), 0) FROM problems), 1))`);

    return {
      deletedAttempts,
      deletedProblems,
      createdDepartments,
      insertedProblems: snapshot.problems.length,
    };
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/importSnapshot.test.ts`
Expected: PASS, 9개 전부.

**Docker 가 꺼져 있으면** 테스트가 실패가 아니라 통째로 건너뛰어진 것처럼 보인다(`beforeAll` 의 `migrateTestDb()` 가 죽는다). `docker ps` 로 `probank-postgres` 가 healthy 인지 먼저 확인한다.

- [ ] **Step 5: 뮤테이션 테스트 (2회)**

1. 번호표 되돌리기(Step 3의 `setval` 구문)를 잠시 주석 처리 → 재실행 → "새 문제를 만들어도 번호가 충돌하지 않는다" 테스트가 실패하는지 확인 → 복원.
2. 부서 처리에서 `if (found)` 분기를 지우고 항상 새로 만들게 변경 → 재실행 → "이미 있는 부서를 건드리지 않는다" 테스트가 실패하는지 확인 → 복원.

각 확인 후 다시 전부 통과하는지 본다.

- [ ] **Step 6: 전체 스위트 확인 + 커밋**

```bash
cd web && npx vitest run
```

```bash
git add web/lib/problemSync/importSnapshot.ts web/lib/problemSync/importSnapshot.test.ts
git commit -m "[ADD] 스냅샷으로 로컬 문제를 교체하는 들여오기 로직"
```

---

### Task 3: 내보내기 로직

**Files:**
- Create: `web/lib/problemSync/exportSnapshot.ts`
- Test: `web/lib/problemSync/exportSnapshot.test.ts`

**Interfaces:**
- Consumes: `ProblemSnapshot`·`SNAPSHOT_VERSION`(Task 1)
- Produces: `assertProdSource(env: { PROD_DATABASE_URL?: string }): string`, `buildSnapshot(rows: ExportRows, source: { host: string; database: string }): ProblemSnapshot`, `exportSnapshot(url: string): Promise<ProblemSnapshot>`, 타입 `ExportRows`. Task 4의 진입점이 `assertProdSource`와 `exportSnapshot`을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problemSync/exportSnapshot.test.ts` 새로 작성. 운영 접속이 필요한 부분은 테스트하지 않는다 — 가드와 순수 변환 함수만 본다:

```typescript
import { describe, it, expect } from "vitest";
import { SNAPSHOT_VERSION } from "./snapshot";
import { assertProdSource, buildSnapshot, type ExportRows } from "./exportSnapshot";

describe("assertProdSource", () => {
  it("설정이 없으면 어디에 넣어야 하는지 알려준다", () => {
    expect(() => assertProdSource({})).toThrow(/PROD_DATABASE_URL/);
  });

  it("로컬을 가리키면 거부한다 — 운영 자리에 로컬을 넣은 실수를 잡는다", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(() => assertProdSource({ PROD_DATABASE_URL: `postgres://u:p@${host}:5432/db` }))
        .toThrow(/로컬/);
    }
  });

  it("URL 로 해석되지 않으면 거부한다 — 확인할 수 없으니 통과시키면 가드가 무의미하다", () => {
    expect(() => assertProdSource({ PROD_DATABASE_URL: "그냥문자열" })).toThrow(/해석/);
  });

  it("원격 주소면 그 값을 그대로 돌려준다", () => {
    const url = "postgres://u:p@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres";
    expect(assertProdSource({ PROD_DATABASE_URL: url })).toBe(url);
  });
});

function rowsFixture(): ExportRows {
  return {
    departments: [
      { code: "DEV", name: "개발팀", status: "ACTIVE" },
      { code: "GONE", name: "폐지팀", status: "INACTIVE" },
    ],
    problems: [
      {
        id: 501, type: "MCQ_SINGLE", content: "본문1", imageUrl: null, referenceText: null,
        explanation: "해설", blankRevealCount: null, status: "ACTIVE", departmentCode: "DEV",
        sourceNumber: 3, createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-02T00:00:00.000Z"),
      },
      {
        id: 502, type: "SHORT_ANSWER", content: "본문2", imageUrl: null, referenceText: null,
        explanation: null, blankRevealCount: null, status: "ARCHIVED", departmentCode: "DEV",
        sourceNumber: 4, createdAt: new Date("2026-08-03T00:00:00.000Z"),
        updatedAt: new Date("2026-08-04T00:00:00.000Z"),
      },
    ],
    choices: [
      { problemId: 501, choiceText: "가", isCorrect: true, displayOrder: 1 },
      { problemId: 501, choiceText: "나", isCorrect: false, displayOrder: 2 },
    ],
    answers: [{ problemId: 502, answerText: "정답" }],
    blanks: [{ problemId: 502, blankKey: "a", answerText: "정답", displayOrder: 1 }],
    problemTags: [
      { problemId: 501, name: "안전" },
      { problemId: 502, name: "안전" },
      { problemId: 502, name: "법규" },
    ],
  };
}

describe("buildSnapshot", () => {
  it("자식 행을 문제별로 묶는다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "prod.example.com", database: "postgres" });

    const [first, second] = snapshot.problems;
    expect(first.id).toBe(501);
    expect(first.choices).toEqual([
      { choiceText: "가", isCorrect: true, displayOrder: 1 },
      { choiceText: "나", isCorrect: false, displayOrder: 2 },
    ]);
    expect(first.answers).toEqual([]);
    expect(first.tags).toEqual(["안전"]);

    expect(second.answers).toEqual([{ answerText: "정답" }]);
    expect(second.blanks).toEqual([{ blankKey: "a", answerText: "정답", displayOrder: 1 }]);
    expect(second.tags).toEqual(["안전", "법규"]);
  });

  it("보관된 문제도 담는다 — 빼면 부서별 문항 번호에 구멍이 생긴다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    expect(snapshot.problems.map((p) => p.status)).toEqual(["ACTIVE", "ARCHIVED"]);
  });

  it("시각을 ISO 문자열로 바꾼다 — JSON 으로 오갈 수 있어야 한다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    expect(snapshot.problems[0].createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(typeof snapshot.generatedAt).toBe("string");
  });

  it("버전과 건수를 채운다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
    expect(snapshot.counts).toEqual({ departments: 2, problems: 2, tags: 2 });
  });

  it("문제가 없는 부서도 담는다 — 로컬 부서 목록도 운영과 같아져야 한다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    expect(snapshot.departments.map((d) => d.code)).toEqual(["DEV", "GONE"]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/exportSnapshot.test.ts`
Expected: FAIL — `./exportSnapshot` 모듈이 없어 import 에러.

- [ ] **Step 3: 구현한다**

`web/lib/problemSync/exportSnapshot.ts` 새로 작성:

```typescript
import postgres from "postgres";
import { SNAPSHOT_VERSION, type ProblemSnapshot, type SnapshotProblem } from "./snapshot";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * 운영 접속 문자열인지 확인하고 돌려준다.
 *
 * lib/devSeed.ts 의 assertSeedableEnvironment 를 뒤집은 형태다 — 저쪽은 "로컬이어야 한다",
 * 이쪽은 "로컬이면 안 된다". 운영용 자리에 로컬 주소를 넣으면 로컬을 읽어 로컬에 덮어쓰는
 * 무의미한 동작이 되므로 여기서 막는다.
 */
export function assertProdSource(env: { PROD_DATABASE_URL?: string }): string {
  const url = env.PROD_DATABASE_URL;
  if (!url) {
    throw new Error("PROD_DATABASE_URL 이 설정되지 않았습니다. web/.env 에 운영 DB 접속 문자열을 넣으세요.");
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // 파싱 실패를 "확인할 수 없으니 통과"로 처리하면 가드가 무의미해진다.
    throw new Error("PROD_DATABASE_URL 을 URL 로 해석할 수 없습니다.");
  }

  // new URL 은 IPv6 를 대괄호째 hostname 에 넣지 않지만, 구현 차이를 타지 않게 벗겨 둔다.
  const bare = host.replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTS.has(bare)) {
    throw new Error(`PROD_DATABASE_URL 이 로컬을 가리킵니다(host=${host}). 운영 접속 문자열을 넣으세요.`);
  }
  return url;
}

export type ExportRows = {
  departments: { code: string; name: string; status: string }[];
  problems: {
    id: number; type: string; content: string; imageUrl: string | null;
    referenceText: string | null; explanation: string | null; blankRevealCount: number | null;
    status: string; departmentCode: string; sourceNumber: number | null;
    createdAt: Date; updatedAt: Date;
  }[];
  choices: { problemId: number; choiceText: string; isCorrect: boolean; displayOrder: number }[];
  answers: { problemId: number; answerText: string }[];
  blanks: { problemId: number; blankKey: string; answerText: string; displayOrder: number }[];
  problemTags: { problemId: number; name: string }[];
};

/** problemId 로 자식 행을 묶는다. */
function groupBy<T extends { problemId: number }, R>(rows: T[], map: (row: T) => R): Map<number, R[]> {
  const grouped = new Map<number, R[]>();
  for (const row of rows) {
    const list = grouped.get(row.problemId);
    if (list) list.push(map(row));
    else grouped.set(row.problemId, [map(row)]);
  }
  return grouped;
}

/**
 * 조회 결과를 스냅샷으로 바꾼다. DB 를 건드리지 않는 순수 함수라 이 부분만 테스트로 덮인다
 * (운영 접속이 필요한 exportSnapshot 은 자동 테스트 대상이 아니다).
 */
export function buildSnapshot(rows: ExportRows, source: { host: string; database: string }): ProblemSnapshot {
  const choicesByProblem = groupBy(rows.choices, (c) => ({
    choiceText: c.choiceText, isCorrect: c.isCorrect, displayOrder: c.displayOrder,
  }));
  const answersByProblem = groupBy(rows.answers, (a) => ({ answerText: a.answerText }));
  const blanksByProblem = groupBy(rows.blanks, (b) => ({
    blankKey: b.blankKey, answerText: b.answerText, displayOrder: b.displayOrder,
  }));
  const tagsByProblem = groupBy(rows.problemTags, (t) => t.name);

  const problems: SnapshotProblem[] = rows.problems.map((p) => ({
    id: p.id,
    type: p.type,
    content: p.content,
    imageUrl: p.imageUrl,
    referenceText: p.referenceText,
    explanation: p.explanation,
    blankRevealCount: p.blankRevealCount,
    status: p.status,
    departmentCode: p.departmentCode,
    sourceNumber: p.sourceNumber,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    choices: choicesByProblem.get(p.id) ?? [],
    answers: answersByProblem.get(p.id) ?? [],
    blanks: blanksByProblem.get(p.id) ?? [],
    tags: tagsByProblem.get(p.id) ?? [],
  }));

  return {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    source,
    counts: {
      departments: rows.departments.length,
      problems: problems.length,
      tags: new Set(rows.problemTags.map((t) => t.name)).size,
    },
    departments: rows.departments,
    problems,
  };
}

/**
 * 운영 DB 를 읽어 스냅샷을 만든다.
 *
 * 모든 조회를 `read only` 트랜잭션 안에서 한다 — 실수로 쓰기 구문이 섞여도 Postgres 가
 * 거부한다. "쓰지 않기로 한다"가 아니라 쓸 수 없게 만드는 것이 요점이다.
 *
 * lib/db/client.ts 의 getDb() 를 쓰지 않는 이유: 그 함수는 연결을 하나만 캐시해서
 * 운영·로컬 두 곳에 동시에 붙을 수 없다. prepare: false 는 Supabase 풀러에 필수다.
 */
export async function exportSnapshot(url: string): Promise<ProblemSnapshot> {
  const sql = postgres(url, { prepare: false });
  try {
    return await sql.begin("read only", async (tx) => {
      // id 계열은 bigint 라 postgres.js 가 문자열로 돌려줄 수 있다. ::int 로 캐스팅해
      // 스냅샷에 숫자로 담는다(parseSnapshot 이 문자열을 거부한다).
      const departments = await tx<{ code: string; name: string; status: string }[]>`
        SELECT code, name, status FROM departments ORDER BY id`;
      const problems = await tx<ExportRows["problems"]>`
        SELECT p.id::int AS id, p.type, p.content,
               p.image_url AS "imageUrl", p.reference_text AS "referenceText",
               p.explanation, p.blank_reveal_count AS "blankRevealCount", p.status,
               d.code AS "departmentCode", p.source_number AS "sourceNumber",
               p.created_at AS "createdAt", p.updated_at AS "updatedAt"
        FROM problems p JOIN departments d ON d.id = p.department_id
        ORDER BY p.id`;
      const choices = await tx<ExportRows["choices"]>`
        SELECT problem_id::int AS "problemId", choice_text AS "choiceText",
               is_correct AS "isCorrect", display_order AS "displayOrder"
        FROM problem_choices ORDER BY problem_id, display_order, id`;
      const answers = await tx<ExportRows["answers"]>`
        SELECT problem_id::int AS "problemId", answer_text AS "answerText"
        FROM problem_answers ORDER BY problem_id, id`;
      const blanks = await tx<ExportRows["blanks"]>`
        SELECT problem_id::int AS "problemId", blank_key AS "blankKey",
               answer_text AS "answerText", display_order AS "displayOrder"
        FROM problem_blanks ORDER BY problem_id, display_order, id`;
      const problemTags = await tx<ExportRows["problemTags"]>`
        SELECT pt.problem_id::int AS "problemId", t.name
        FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
        ORDER BY pt.problem_id, t.name`;

      return buildSnapshot(
        { departments: [...departments], problems: [...problems], choices: [...choices],
          answers: [...answers], blanks: [...blanks], problemTags: [...problemTags] },
        { host: new URL(url).hostname, database: new URL(url).pathname.replace(/^\//, "") },
      );
    });
  } finally {
    await sql.end();
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/exportSnapshot.test.ts`
Expected: PASS, 9개 전부.

- [ ] **Step 5: 뮤테이션 테스트**

`assertProdSource`의 `LOCAL_HOSTS.has(bare)` 조건을 잠시 `false`로 바꿔 저장 → 재실행 → "로컬을 가리키면 거부한다" 테스트가 실패하는지 확인 → 복원 → 다시 통과 확인.

- [ ] **Step 6: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

타입 검사를 여기서 한 번 도는 이유: `sql.begin("read only", ...)`의 반환 타입과 postgres.js 태그 템플릿의 제네릭이 실제로 맞는지는 vitest 가 잡아 주지 않는다(테스트가 `exportSnapshot` 을 부르지 않는다).

```bash
git add web/lib/problemSync/exportSnapshot.ts web/lib/problemSync/exportSnapshot.test.ts
git commit -m "[ADD] 운영 DB 를 읽어 스냅샷을 만드는 내보내기 로직"
```

---

### Task 4: 명령어 배선과 실제 실행

**Files:**
- Create: `web/scripts/sync-problems-export.ts`, `web/scripts/sync-problems-import.ts`
- Modify: `web/package.json`(scripts 블록), `web/.gitignore`(`.data/` 추가)

**Interfaces:**
- Consumes: `assertProdSource`·`exportSnapshot`(Task 3), `parseSnapshot`·`SNAPSHOT_PATH`(Task 1), `importSnapshot`(Task 2), `assertSeedableEnvironment`(`web/lib/devSeed.ts`), `getDb`(`web/lib/db/client.ts`)
- Produces: 없음(종단). 사용자가 쓰는 명령어 `pnpm sync:problems`·`:export`·`:import`.

**사전 준비:** 이 태스크의 Step 5(실제 실행)에는 운영 DB 접속 문자열이 필요하다. `web/.env`에 `PROD_DATABASE_URL=postgres://...` 한 줄이 있어야 하며, 없으면 Step 1~4까지만 하고 Step 5는 값을 받은 뒤에 진행한다.

- [ ] **Step 1: 내보내기 진입점을 만든다**

`web/scripts/sync-problems-export.ts` 새로 작성. 기존 `scripts/seed-dev.ts`의 형태를 그대로 따른다:

```typescript
// tsx 는 .env 를 로드하지 않는다. 이 import 가 없으면 .env 가 채워져 있어도
// PROD_DATABASE_URL 을 못 찾는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertProdSource, exportSnapshot } from "../lib/problemSync/exportSnapshot";
import { SNAPSHOT_PATH } from "../lib/problemSync/snapshot";

async function main() {
  // 운영 자리에 로컬을 넣은 실수를 여기서 막는다.
  const url = assertProdSource(process.env);

  const snapshot = await exportSnapshot(url);
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`스냅샷 저장: ${SNAPSHOT_PATH}`);
  console.log(`  출처: ${snapshot.source.host}/${snapshot.source.database}`);
  console.log(`  부서 ${snapshot.counts.departments}개 · 문제 ${snapshot.counts.problems}개 · 태그 ${snapshot.counts.tags}개`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("내보내기 실패", error);
    process.exit(1);
  });
```

- [ ] **Step 2: 들여오기 진입점을 만든다**

`web/scripts/sync-problems-import.ts` 새로 작성:

```typescript
// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { getDb } from "../lib/db/client";
import { assertSeedableEnvironment } from "../lib/devSeed";
import { importSnapshot } from "../lib/problemSync/importSnapshot";
import { parseSnapshot, SNAPSHOT_PATH } from "../lib/problemSync/snapshot";

async function main() {
  // 로컬 DB 가 아니면 여기서 멈춘다. 이 아래는 기존 문제와 풀이 이력을 전부 지운다.
  assertSeedableEnvironment(process.env);

  const raw = await readFile(SNAPSHOT_PATH, "utf8").catch(() => {
    throw new Error(`스냅샷 파일이 없습니다: ${SNAPSHOT_PATH}. pnpm sync:problems:export 를 먼저 실행하세요.`);
  });
  // DB 를 건드리기 전에 파일 전체를 검증한다 — 절반 읽다 터지면 로컬이 빈 채로 남는다.
  const snapshot = parseSnapshot(JSON.parse(raw));

  const result = await importSnapshot(getDb(), snapshot);

  console.log(`스냅샷: ${snapshot.generatedAt} (${snapshot.source.host})`);
  console.log(`  삭제: 풀이 이력 ${result.deletedAttempts}건 · 기존 문제 ${result.deletedProblems}개`);
  console.log(`  부서: ${result.createdDepartments}개 생성`);
  console.log(`  적재: 문제 ${result.insertedProblems}개`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("들여오기 실패", error);
    process.exit(1);
  });
```

- [ ] **Step 3: 명령어와 gitignore 를 배선한다**

`web/package.json`의 `scripts` 블록에서 `"seed:dev": "tsx scripts/seed-dev.ts"` 줄 **뒤에** 세 줄을 추가한다:

```json
    "seed:dev": "tsx scripts/seed-dev.ts",
    "sync:problems": "pnpm sync:problems:export && pnpm sync:problems:import",
    "sync:problems:export": "tsx scripts/sync-problems-export.ts",
    "sync:problems:import": "tsx scripts/sync-problems-import.ts"
```

`web/.gitignore` 맨 끝에 추가한다:

```
# 운영에서 내려받은 문제 스냅샷 (scripts/sync-problems-export.ts)
.data/
```

- [ ] **Step 4: 안전장치가 실제로 막는지 확인한다**

운영 접속 없이 확인할 수 있는 것들이다. 아래 명령은 **bash 로** 실행한다(`VAR=값 명령` 형태의 환경변수 접두사는 PowerShell 에서 동작하지 않는다).

로컬 주소를 운영 자리에 넣으면 거부하는지:

```bash
cd web && PROD_DATABASE_URL=postgres://u:p@localhost:5432/db pnpm sync:problems:export
```
Expected: 실패. `PROD_DATABASE_URL 이 로컬을 가리킵니다(host=localhost)...`

설정이 아예 없으면 어디에 넣어야 하는지 알려주는지(`.env` 에 이미 넣어 두었더라도 이 한 줄로 비운 채 확인할 수 있다):

```bash
cd web && PROD_DATABASE_URL= pnpm sync:problems:export
```
Expected: 실패. `PROD_DATABASE_URL 이 설정되지 않았습니다. web/.env 에 운영 DB 접속 문자열을 넣으세요.`

스냅샷 파일 없이 들여오려 하면 순서를 알려주는지(아직 `export` 를 돌리기 전에 확인한다):

```bash
cd web && pnpm sync:problems:import
```
Expected: 실패. `스냅샷 파일이 없습니다: .data/prod-problems.json. pnpm sync:problems:export 를 먼저 실행하세요.`

들여오기의 로컬 전용 가드(`DATABASE_URL` 이 로컬이 아니거나 `NODE_ENV=production` 이면 거부)는 **새로 테스트하지 않는다** — 재사용하는 `assertSeedableEnvironment` 가 `web/lib/devSeed.test.ts` 에서 이미 5개 테스트로 덮여 있다.

- [ ] **Step 5: 운영을 상대로 실제로 돌린다 (PROD_DATABASE_URL 필요)**

```bash
cd web && pnpm sync:problems:export
```

확인할 것:
- 출력된 부서·문제·태그 건수가 운영 실제와 맞는지
- `.data/prod-problems.json`을 열어 문제 몇 개를 눈으로 확인(본문이 깨지지 않았는지, `departmentCode`가 채워졌는지, `id`가 따옴표 없는 숫자인지)
- **운영 부서 코드가 로컬(`DEV`·`SALES`·`CONST` 등)과 맞는지.** 다르면 들여올 때 새 부서가 잔뜩 생긴다 — 그 경우 멈추고 보고한다.

```bash
cd web && pnpm sync:problems:import
```

확인할 것:
- 삭제·생성 건수가 예상과 맞는지
- 부서 생성 개수가 0에 가까운지(많으면 코드가 어긋난 것이다)

- [ ] **Step 6: 화면에서 실측한다**

```bash
cd web && rm -rf .next && npx next dev -p 3200
```

`next build`를 dev 서버와 동시에 돌리지 않는다 — 같은 `.next` 를 함께 써서 화면이 "세션 확인 중..."에서 멈춘다(2026-09-01 확인).

브라우저로 `dev_emp`/`Test1234!` 로그인 후 확인:
- 문제 목록에 운영 문항이 부서별로 보이는지
- 부서 필터가 실제 부서로 동작하는지
- 문제 하나를 풀어 채점·정답 표시가 정상인지
- 이미지가 붙은 문제가 있다면 이미지가 뜨는지
- 콘솔 오류 0건

- [ ] **Step 7: 전체 검증 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/scripts/sync-problems-export.ts web/scripts/sync-problems-import.ts web/package.json web/.gitignore
git commit -m "[ADD] 운영 문제 동기화 명령어 배선"
```

---

## 이 계획이 다루지 않는 것 (일부러 뺀 것)

- **운영 계정 동기화** — 실제 직원 정보를 로컬에 두지 않는다. 로컬은 `seed:dev` 계정을 계속 쓴다.
- **로컬 → 운영 방향** — 한 방향뿐이다.
- **이미지 파일 복사** — 주소만 옮긴다. 이미지는 Supabase 에 있고 로컬 앱이 이미 가진 키로 불러온다.
- **적재 속도 최적화** — 문제마다 최대 4번 왕복한다(700문항이면 약 3,000회). 로컬 Postgres 상대로 수 초 수준이라 묶어 넣는 최적화는 하지 않는다.
- **감사 로그·엑셀 업로드 기록 정리** — 문제와 외래키로 묶여 있지 않아 그대로 둔다.
