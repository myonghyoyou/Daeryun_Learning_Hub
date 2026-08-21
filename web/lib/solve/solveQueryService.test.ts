import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problemBlanks, problemChoices, problems, users } from "../db/schema";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import {
  getSolveDetail, listSolveProblems, randomSolveSet, selectRandomBlankKeys,
} from "./solveQueryService";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  // problems.created_by 는 NOT NULL + users FK 다 — 문제를 만들려면 사용자가 먼저다.
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

async function seed(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

async function seedMcq() {
  const id = await seed({ type: "MCQ_SINGLE" });
  await db.insert(problemChoices).values([
    { problemId: id, choiceText: "가", isCorrect: true, displayOrder: 1 },
    { problemId: id, choiceText: "나", isCorrect: false, displayOrder: 2 },
  ]);
  return id;
}

async function seedOx() {
  const id = await seed({ type: "OX" });
  await db.insert(problemChoices).values([
    { problemId: id, choiceText: "O", isCorrect: true, displayOrder: 1 },
    { problemId: id, choiceText: "X", isCorrect: false, displayOrder: 2 },
  ]);
  return id;
}

async function seedShort() {
  return seed({ type: "SHORT_ANSWER" });
}

async function seedFillBlank(blankKeys: string[], revealCount: number) {
  const id = await seed({ type: "FILL_BLANK", blankRevealCount: revealCount });
  await db.insert(problemBlanks).values(
    blankKeys.map((k, i) => ({ problemId: id, blankKey: k, answerText: `정답-${k}`, displayOrder: i + 1 })),
  );
  return id;
}

describe("getSolveDetail", () => {
  it("Q1: 없는 문제와 보관된 문제가 같은 문구다", async () => {
    await expect(getSolveDetail(db, 999999)).rejects
      .toMatchObject({ message: "존재하지 않거나 보관된 문제입니다." });
    const archived = await seed({ status: "ARCHIVED" });
    await expect(getSolveDetail(db, archived)).rejects
      .toMatchObject({ message: "존재하지 않거나 보관된 문제입니다." });
  });

  it("Q1: BizError 이고 INPUT_VALUE_INVALID 코드다", async () => {
    await expect(getSolveDetail(db, 999999)).rejects.toBeInstanceOf(BizError);
  });

  it("Q2/Q3: 객관식 보기는 {id, text} 뿐이고 정답 플래그가 없다", async () => {
    const mcqId = await seedMcq();
    const detail = await getSolveDetail(db, mcqId);
    expect(Object.keys(detail.choices![0]).sort()).toEqual(["id", "text"]);
    expect(JSON.stringify(detail)).not.toContain("isCorrect");
    expect(JSON.stringify(detail)).not.toContain("choiceText");
  });

  // 리뷰 지적 3: {...row} 스프레드로 바뀌어도(내부 id/problemId/displayOrder 유출) 예전엔
  // 아무 것도 못 잡았다 — 키 집합을 정확히 못박는다.
  it("Q2/Q3-1: choices 항목의 키 집합이 정확히 {id, text} 다 — 다른 필드가 섞이면 안 된다", async () => {
    const mcqId = await seedMcq();
    const detail = await getSolveDetail(db, mcqId);
    for (const c of detail.choices!) expect(Object.keys(c).sort()).toEqual(["id", "text"]);
  });

  // 리뷰 지적 2: denylist(문자열 3개) 만으로는 다른 키 이름으로 새는 값(예: hint: explanation)을
  // 못 잡는다 — Java DTO 는 정확히 10개 필드다. 전체 키 집합을 못박는다.
  it("Q11-1: 상세 응답의 최상위 키 집합이 정확히 열 개다", async () => {
    const mcqId = await seedMcq();
    const detail = await getSolveDetail(db, mcqId);
    expect(Object.keys(detail).sort()).toEqual([
      "blanksToAnswer", "choices", "content", "departmentName", "id",
      "imageUrl", "referenceText", "revealedBlanks", "sourceNumber", "type",
    ]);
  });

  it("Q11: 응답 전체에 정답성 키가 하나도 없다", async () => {
    const mcqId = await seedMcq();
    const oxId = await seedOx(); // 리뷰 지적 5: 보기 없는 OX 는 매핑 코드를 전혀 안 거친다.
    const shortId = await seedShort();
    const blankId = await seedFillBlank(["a", "b"], 1);
    for (const id of [mcqId, oxId, shortId, blankId]) {
      const json = JSON.stringify(await getSolveDetail(db, id));
      for (const leak of ["\"correct\"", "\"isCorrect\"", "\"explanation\""]) {
        expect(json).not.toContain(leak);
      }
    }
  });

  it("Q4: 단답은 choices·blanksToAnswer·revealedBlanks 가 전부 null 이다", async () => {
    const shortId = await seedShort();
    const d = await getSolveDetail(db, shortId);
    expect([d.choices, d.blanksToAnswer, d.revealedBlanks]).toEqual([null, null, null]);
  });

  it("Q5/Q6: 빈칸은 revealCount 개만 묻고 나머지는 정답째로 공개한다", async () => {
    // 리뷰 지적 4: 단일 무작위 추출값에 대한 not.toContain 은 인덱스 기반 필터 회귀를
    // 3번 중 1번만 잡는다(추출된 인덱스가 우연히 검사 대상과 겹치지 않으면 통과) — 매
    // 실행마다 결정적으로 성립하는 형태로 바꾼다: 묻는 칸과 공개된 칸이 서로소이고,
    // 합쳐서 전체 빈칸 집합을 정확히 분할(partition)해야 한다.
    for (let i = 0; i < 20; i += 1) {
      const blank3Id = await seedFillBlank(["a", "b", "c"], 1);
      const d = await getSolveDetail(db, blank3Id);
      expect(d.blanksToAnswer!.length).toBe(1);
      expect(d.revealedBlanks!.length).toBe(2);
      expect(d.revealedBlanks![0].answerText).toBeTruthy();
      const asked = new Set(d.blanksToAnswer!);
      expect(d.revealedBlanks!.some((b) => asked.has(b.blankKey))).toBe(false);
      expect(new Set([...asked, ...d.revealedBlanks!.map((b) => b.blankKey)]).size).toBe(3);
    }
  });

  // 리뷰 지적 3: {...row} 스프레드로 바뀌어도(내부 id/problemId/displayOrder 유출) 예전엔
  // 아무 것도 못 잡았다 — Java 의 RevealedBlank 는 두 필드뿐이다.
  it("Q6-2: revealedBlanks 항목의 키 집합이 정확히 {blankKey, answerText} 다", async () => {
    const blank3Id = await seedFillBlank(["a", "b", "c"], 1);
    const d = await getSolveDetail(db, blank3Id);
    for (const b of d.revealedBlanks!) expect(Object.keys(b).sort()).toEqual(["answerText", "blankKey"]);
  });

  it("Q6-1: 전부 묻는 문제면 revealedBlanks 는 빈 배열이지 null 이 아니다", async () => {
    const blankAllId = await seedFillBlank(["a", "b"], 2);
    const d = await getSolveDetail(db, blankAllId);
    expect(d.revealedBlanks).toEqual([]);
  });

  it("Q7: FILL_BLANK 는 choices 가 null 이다", async () => {
    const blankId = await seedFillBlank(["a"], 1);
    expect((await getSolveDetail(db, blankId)).choices).toBeNull();
  });

  // Critical(리뷰): blankRevealCount 가 NULL 인 행은 생성 검증(>=1)을 정상 경로로는
  // 통과할 수 없지만, 그 검증을 우회한 행(수기 삽입 등)이 존재할 수 있다. API 경로로는
  // 만들 수 없으므로 테스트 DB 에 직접 NULL 행을 심는다. `problem.blankRevealCount!` 는
  // 타입 단언일 뿐이라 `Math.min(null, n)` 이 조용히 0 을 내고 — blanksToAnswer 가 [],
  // revealedBlanks 가 전체 — 모든 정답이 새 나가는 것이 Critical 결함이었다.
  // Java 는 int 언박싱 NPE 로 죽어 200/-1/처리 중 오류가 발생하였습니다 로 떨어지므로,
  // 포트도 명시적으로 실패해야 하고 그 실패 응답에 answerText 가 실리면 안 된다.
  it("Critical: blankRevealCount 가 NULL 이면 던지고, 정답이 새 나가지 않는다", async () => {
    const id = await seed({ type: "FILL_BLANK", blankRevealCount: null });
    await db.insert(problemBlanks).values([
      { problemId: id, blankKey: "a", answerText: "정답-a", displayOrder: 1 },
      { problemId: id, blankKey: "b", answerText: "정답-b", displayOrder: 2 },
      { problemId: id, blankKey: "c", answerText: "정답-c", displayOrder: 3 },
    ]);
    let caught: unknown;
    try {
      await getSolveDetail(db, id);
    } catch (e) {
      caught = e;
    }
    // 코드까지 본다. MSG_PROC_FAIL 은 200/-1 이고 INPUT_VALUE_INVALID 는 400/1000 이라
    // 봉투가 완전히 다르다 — 이 가드의 목적이 Java 의 결과(200/-1)를 맞추는 것이므로
    // "BizError 이기만 하면 된다"로 두면 가드가 지키려던 것을 안 지킨다.
    expect(caught).toBeInstanceOf(BizError);
    expect((caught as BizError).errorCode).toBe(ErrorCode.MSG_PROC_FAIL);
    expect(JSON.stringify(caught)).not.toContain("answerText");
    expect(JSON.stringify(caught)).not.toContain("정답-");
  });

  it("Critical: blankRevealCount 가 음수여도 같은 방식으로 던진다 — slice(0,-1) 로 전부 새지 않는다", async () => {
    const id = await seed({ type: "FILL_BLANK", blankRevealCount: -1 });
    await db.insert(problemBlanks).values([
      { problemId: id, blankKey: "a", answerText: "정답-a", displayOrder: 1 },
      { problemId: id, blankKey: "b", answerText: "정답-b", displayOrder: 2 },
    ]);
    await expect(getSolveDetail(db, id)).rejects.toMatchObject({ errorCode: ErrorCode.MSG_PROC_FAIL });
  });

  it("Q10: 부서명은 별도 조회다", async () => {
    const mcqId = await seedMcq();
    expect((await getSolveDetail(db, mcqId)).departmentName).toBe("가팀");
  });

  it("Q12: imageUrl 은 저장된 값 그대로다", async () => {
    const id = await seed({ imageUrl: "/api/problem-images/x.png" });
    expect((await getSolveDetail(db, id)).imageUrl).toBe("/api/problem-images/x.png");
  });
});

// selectRandomBlankKeys 는 순수 함수라 무작위여도 성질은 결정적으로 고정된다(Q8·Q9).
describe("selectRandomBlankKeys", () => {
  it("Q8: count 개를 고르고, 원본의 부분집합이며, 중복이 없다", () => {
    const keys = ["a", "b", "c", "d"];
    for (let i = 0; i < 50; i++) {
      const picked = selectRandomBlankKeys(keys, 2);
      expect(picked).toHaveLength(2);
      expect(new Set(picked).size).toBe(2);
      expect(picked.every((k) => keys.includes(k))).toBe(true);
    }
  });

  it("Q8: 실제로 섞인다 — 50회 중 두 가지 이상의 결과가 나온다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(selectRandomBlankKeys(["a", "b", "c"], 2).join(","));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("Q9: count 가 빈칸 수보다 크면 전체를 돌려준다 — 오류가 아니다", () => {
    expect(selectRandomBlankKeys(["a", "b"], 5)).toHaveLength(2);
  });

  it("빈 배열이면 빈 배열", () => expect(selectRandomBlankKeys([], 3)).toEqual([]));
});

describe("listSolveProblems / randomSolveSet", () => {
  it("목록·랜덤은 findActiveSolveProblems·findRandomActiveProblems 를 그대로 위임한다", async () => {
    await seed({ content: "본문1" });
    await seed({ content: "본문2" });
    expect((await listSolveProblems(db, {})).length).toBe(2);
    expect((await randomSolveSet(db, { count: 1 })).length).toBe(1);
  });
});
