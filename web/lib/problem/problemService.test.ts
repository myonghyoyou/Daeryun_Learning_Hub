import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, problems, users } from "../db/schema";
import { ErrorCode } from "../http/errorCode";
import { BizError } from "../http/errors";
import type { AuthUser } from "../auth/types";
import type { ChoiceInput, ProblemCreateInput } from "./problemValidation";
import {
  archiveProblem, createProblem, getProblemDetail, isDuplicateSourceNumber, lookupDepartmentName,
  translateDuplicateSourceNumber, updateProblem,
} from "./problemService";

const db = testDb();
let deptA = 0, deptB = 0, inactiveDeptId = 0, superAdminId = 0, deptAdminId = 0;
let superAdmin: AuthUser;
let deptAdminOfA: AuthUser;
let seq = 0;

function nextNumber() { return ++seq; }
function c(text: string, correct = false): ChoiceInput { return { text, correct }; }

function oxRequest(o: Partial<ProblemCreateInput> = {}): ProblemCreateInput {
  return { type: "OX", content: "본문", choices: [c("O", true), c("X")], sourceNumber: nextNumber(), ...o };
}
function mcqRequest(o: Partial<ProblemCreateInput> = {}): ProblemCreateInput {
  return { type: "MCQ_SINGLE", content: "본문", choices: [c("가", true), c("나")], sourceNumber: nextNumber(), ...o };
}
function shortAnswerRequest(o: Partial<ProblemCreateInput> = {}): ProblemCreateInput {
  return { type: "SHORT_ANSWER", content: "본문", answers: ["서울"], sourceNumber: nextNumber(), ...o };
}
function fillBlankRequest(o: Partial<ProblemCreateInput> = {}): ProblemCreateInput {
  return {
    type: "FILL_BLANK", content: "수도는 {{a}} 이다.",
    blanks: [{ blankKey: "a", answerText: "서울" }], blankRevealCount: 1,
    sourceNumber: nextNumber(), ...o,
  };
}

async function createAndReturnId(
  input: ProblemCreateInput, departmentId: number = deptA, actor: AuthUser = superAdmin,
): Promise<number> {
  await createProblem(db, input, departmentId, actor);
  const owning = actor.role === "SUPER_ADMIN" ? departmentId : actor.departmentId;
  const [row] = await db.select().from(problems)
    .where(and(eq(problems.departmentId, owning), eq(problems.sourceNumber, input.sourceNumber!)));
  return row.id;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  seq = 0;
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

describe("problem service", () => {
  it("중복 문항번호를 한국어로 안내한다", async () => {
    // 2026-08-14 Critical(QA-1) 재발 방지: 부서명 조회가 catch 안에 있으면
    // 트랜잭션 abort(25P02) 때문에 이 테스트가 BizError 대신 DB 예외로 실패한다.
    await createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin);
    await expect(createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin))
      .rejects.toMatchObject({ message: "가팀 5번은 이미 있습니다. 다른 번호를 입력하세요." });
  });

  it("수정 경로도 같은 문구를 낸다", async () => {
    await createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin);
    const id = await createAndReturnId(oxRequest({ sourceNumber: 6 }));
    await expect(updateProblem(db, id, oxRequest({ sourceNumber: 5 }), superAdmin))
      .rejects.toMatchObject({ message: "가팀 5번은 이미 있습니다. 다른 번호를 입력하세요." });
  });

  it("중복 안내는 BizError(1000) 이다", async () => {
    await createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin);
    await expect(createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin))
      .rejects.toMatchObject({ errorCode: ErrorCode.INPUT_VALUE_INVALID });
  });

  it("다른 제약의 UNIQUE 위반은 번호 탓으로 돌리지 않는다", () => {
    const other = { code: "23505", constraint_name: "users_email_key" };
    expect(translateDuplicateSourceNumber(other, "가팀", 5)).toBe(other);
    const notUnique = { code: "23503", constraint_name: "uq_problems_department_source_number" };
    expect(translateDuplicateSourceNumber(notUnique, "가팀", 5)).toBe(notUnique);
  });

  // Task 9(엑셀)는 같은 위반에 다른 문구를 내야 하므로 번역문이 아니라 이 판정을 쓴다.
  // BizError 여부로 대신 판정하면 트랜잭션 안의 다른 BizError(예: 태그 21개)까지
  // 중복 번호로 오분류된다 — 그래서 판정은 여기 하나뿐이어야 한다.
  it("isDuplicateSourceNumber 는 그 제약의 23505 에만 true 다", () => {
    expect(isDuplicateSourceNumber({ code: "23505", constraint_name: "uq_problems_department_source_number" })).toBe(true);
    // 다른 제약의 UNIQUE 위반(동시 태그 생성 등)은 false 다.
    expect(isDuplicateSourceNumber({ code: "23505", constraint_name: "tags_name_unique" })).toBe(false);
    // SQLSTATE 가 다르면 제약명이 같아도 false 다.
    expect(isDuplicateSourceNumber({ code: "23503", constraint_name: "uq_problems_department_source_number" })).toBe(false);
    // postgres.js 는 `constraint` 가 아니라 `constraint_name` 을 준다(정답지 N7).
    expect(isDuplicateSourceNumber({ code: "23505", constraint: "uq_problems_department_source_number" })).toBe(false);
    // BizError 로 판정하던 우회가 오분류하던 바로 그 입력들.
    expect(isDuplicateSourceNumber(new BizError(ErrorCode.INPUT_VALUE_INVALID, "태그는 문제당 20개, 태그명은 100자 이하여야 합니다."))).toBe(false);
    expect(isDuplicateSourceNumber(new Error("boom"))).toBe(false);
    expect(isDuplicateSourceNumber(null)).toBe(false);
    expect(isDuplicateSourceNumber(undefined)).toBe(false);
  });

  it("실제 DB 의 중복 위반에도 isDuplicateSourceNumber 가 true 다", async () => {
    await createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin);
    // 번역을 거치지 않은 **원본** 드라이버 오류로 판정한다 — Task 9 가 보게 될 모양 그대로.
    const raw = await db.insert(problems).values({
      type: "OX", content: "본문", status: "ACTIVE",
      departmentId: deptA, sourceNumber: 5, createdBy: superAdminId,
    }).then(() => null, (error: unknown) => error);
    expect(raw).not.toBeNull();
    expect(isDuplicateSourceNumber(raw)).toBe(true);
  });

  it("부서 관리자는 남의 부서 문제에 접근할 수 없다", async () => {
    const id = await createAndReturnId(oxRequest({}), deptB, superAdmin);
    await expect(getProblemDetail(db, id, deptAdminOfA)).rejects.toMatchObject({ errorCode: ErrorCode.ACCESS_AUTH_DENIED });
    await expect(updateProblem(db, id, oxRequest({}), deptAdminOfA)).rejects.toMatchObject({ errorCode: ErrorCode.ACCESS_AUTH_DENIED });
    await expect(archiveProblem(db, id, deptAdminOfA)).rejects.toMatchObject({ errorCode: ErrorCode.ACCESS_AUTH_DENIED });
  });

  it("부서 관리자는 요청 부서를 무시하고 자기 부서에 등록한다", async () => {
    await createProblem(db, oxRequest({ sourceNumber: 3 }), deptB, deptAdminOfA);
    const [row] = await db.select().from(problems);
    expect(row.departmentId).toBe(deptA);
  });

  it("비활성 부서에는 등록할 수 없다", async () => {
    await expect(createProblem(db, oxRequest({}), inactiveDeptId, superAdmin))
      .rejects.toMatchObject({ message: "비활성 부서에는 문제를 등록할 수 없습니다: 폐지팀" });
  });

  it("문항번호 검증이 부서 해석보다 먼저다", async () => {
    // 정답지 R12: 부서도 번호도 없으면 "문항 번호를 입력하세요."가 먼저 뜬다.
    await expect(createProblem(db, oxRequest({ sourceNumber: null }), null, superAdmin))
      .rejects.toMatchObject({ message: "문항 번호를 입력하세요." });
  });

  it("수정은 유형을 바꿀 수 없다", async () => {
    const id = await createAndReturnId(oxRequest({}));
    await expect(updateProblem(db, id, shortAnswerRequest({}), superAdmin)).rejects.toMatchObject({ message: "문제 유형은 수정할 수 없습니다." });
  });

  it("수정은 보기·정답·빈칸을 지우고 다시 넣는다", async () => {
    const id = await createAndReturnId(mcqRequest({ choices: [c("가", true), c("나")] }));
    await updateProblem(db, id, mcqRequest({ choices: [c("다", true), c("라"), c("마")] }), superAdmin);
    const detail = await getProblemDetail(db, id, superAdmin);
    expect(detail.choices.map((x) => x.choiceText)).toEqual(["다", "라", "마"]);
  });

  it("보관은 상태만 바꾼다", async () => {
    const id = await createAndReturnId(oxRequest({}));
    await archiveProblem(db, id, superAdmin);
    expect((await getProblemDetail(db, id, superAdmin)).status).toBe("ARCHIVED");
  });

  it("없는 문제는 안내 문구가 같다", async () => {
    await expect(archiveProblem(db, 999999, superAdmin)).rejects.toMatchObject({ message: "존재하지 않는 문제입니다." });
    await expect(getProblemDetail(db, 999999, superAdmin)).rejects.toMatchObject({ message: "존재하지 않는 문제입니다." });
    await expect(updateProblem(db, 999999, oxRequest({}), superAdmin)).rejects.toMatchObject({ message: "존재하지 않는 문제입니다." });
  });

  it("상세조회 보기의 정답 플래그 이름은 correct 다", async () => {
    // 정답지 D2: 프론트는 choice.correct 를 읽는다. Drizzle 행의 isCorrect 를 그대로 펼치면
    // 저장된 MCQ/OX 를 다시 열 때 정답이 선택되지 않은 것처럼 보이고, 그 상태로 저장하면 정답이 지워진다.
    const id = await createAndReturnId(mcqRequest({ choices: [c("가", false), c("나", true)] }));
    const detail = await getProblemDetail(db, id, superAdmin);
    expect(detail.choices.map((x) => x.correct)).toEqual([false, true]);
    expect(Object.keys(detail.choices[0]).sort()).toEqual(["choiceText", "correct", "displayOrder", "id", "problemId"]);
  });

  it("상세조회 응답은 Spring 필드 구성과 같다", async () => {
    const id = await createAndReturnId(shortAnswerRequest({ answers: ["서울"], tags: ["Seoul", "seoul", "지리"] }));
    const detail = await getProblemDetail(db, id, superAdmin);
    expect(Object.keys(detail)).toEqual([
      "id", "type", "content", "imageUrl", "referenceText", "explanation", "blankRevealCount",
      "status", "departmentId", "sourceNumber", "choices", "answers", "blanks", "tags",
    ]);
    // 정답지 D4: answers·tags 는 객체가 아니라 문자열 배열이다.
    expect(detail.answers).toEqual(["서울"]);
    // 정답지 V29: 태그는 저장 시점에 소문자·중복 제거된다("Seoul"·"seoul" 이 한 개로 합쳐진다).
    // 정렬은 DAO 가 DB 콜레이션(tags.name ASC)에 맡기므로 비교 전에 다시 정렬한다.
    expect([...detail.tags].sort()).toEqual(["seoul", "지리"]);
  });

  it("빈칸 문제는 blanks 와 노출 개수를 그대로 돌려준다", async () => {
    const id = await createAndReturnId(fillBlankRequest({}));
    const detail = await getProblemDetail(db, id, superAdmin);
    expect(detail.blanks.map((b) => b.blankKey)).toEqual(["a"]);
    expect(detail.blanks[0].answerText).toBe("서울");
    expect(detail.blankRevealCount).toBe(1);
  });

  it("FILL_BLANK 가 아니면 blankRevealCount 는 항상 null 로 저장된다", async () => {
    // 정답지 V31: 요청에 값이 실려 와도 저장은 null 이다(생성·수정 모두).
    const id = await createAndReturnId(oxRequest({ blankRevealCount: 3 }));
    expect((await getProblemDetail(db, id, superAdmin)).blankRevealCount).toBeNull();
    await updateProblem(db, id, oxRequest({ sourceNumber: 1, blankRevealCount: 4 }), superAdmin);
    expect((await getProblemDetail(db, id, superAdmin)).blankRevealCount).toBeNull();
  });

  it("감사 로그를 남긴다", async () => {
    const id = await createAndReturnId(oxRequest({}));
    await updateProblem(db, id, oxRequest({ sourceNumber: 1 }), superAdmin);
    await archiveProblem(db, id, superAdmin);
    const rows = await db.select().from(auditLogs).orderBy(auditLogs.id);
    expect(rows.map((r) => r.action)).toEqual(["PROBLEM_CREATED", "PROBLEM_UPDATED", "PROBLEM_ARCHIVED"]);
    expect(rows[0].targetType).toBe("PROBLEM");
    expect(rows[0].targetId).toBe(id);
    expect(rows[0].detail).toEqual({ type: "OX" });
    expect(rows[2].detail).toEqual({});
  });
  it("태그 위반보다 중복 문항번호 안내가 먼저다", async () => {
    // Java 는 normalizeTags 를 replaceTags 의 인자로 평가한다(ProblemServiceImpl.java:124 create,
    // :162 update) — 즉 INSERT/UPDATE 보다 뒤다. 트랜잭션 밖으로 끌어올리면 태그 21개 + 이미
    // 쓰인 번호일 때 태그 문구가 중복 번호 안내를 가로채 Spring 과 다른 메시지가 나간다.
    const manyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    await createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin);
    await expect(createProblem(db, oxRequest({ sourceNumber: 5, tags: manyTags }), deptA, superAdmin))
      .rejects.toMatchObject({ message: "가팀 5번은 이미 있습니다. 다른 번호를 입력하세요." });
    const id = await createAndReturnId(oxRequest({ sourceNumber: 6 }));
    await expect(updateProblem(db, id, oxRequest({ sourceNumber: 5, tags: manyTags }), superAdmin))
      .rejects.toMatchObject({ message: "가팀 5번은 이미 있습니다. 다른 번호를 입력하세요." });
  });

  it("태그 위반 자체는 그대로 막는다", async () => {
    await expect(createProblem(db, oxRequest({ tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) }), deptA, superAdmin))
      .rejects.toMatchObject({ message: "태그는 문제당 20개, 태그명은 100자 이하여야 합니다." });
    expect(await db.select().from(problems)).toHaveLength(0); // 롤백까지 확인
  });

  it("수정은 이전 정답 목록을 지우고 다시 넣는다", async () => {
    // 정답지 V30: 보기뿐 아니라 정답·빈칸도 전량 삭제 후 재삽입이다. 유형은 못 바꾸므로(V4)
    // 유형별로 각각 확인하지 않으면 delete 한 줄이 빠져도 스위트가 초록으로 남는다.
    const id = await createAndReturnId(shortAnswerRequest({ answers: ["서울", "경성"] }));
    await updateProblem(db, id, shortAnswerRequest({ sourceNumber: 1, answers: ["부산"] }), superAdmin);
    expect((await getProblemDetail(db, id, superAdmin)).answers).toEqual(["부산"]);
  });

  it("수정은 이전 빈칸을 지우고 다시 넣는다", async () => {
    const id = await createAndReturnId(fillBlankRequest({}));
    await updateProblem(db, id, fillBlankRequest({
      sourceNumber: 1, content: "{{b}} 와 {{c}} 이다.",
      blanks: [{ blankKey: "b", answerText: "부산" }, { blankKey: "c", answerText: "대구" }],
      blankRevealCount: 2,
    }), superAdmin);
    const detail = await getProblemDetail(db, id, superAdmin);
    expect(detail.blanks.map((b) => b.blankKey)).toEqual(["b", "c"]);
    expect(detail.blanks.map((b) => b.displayOrder)).toEqual([1, 2]);
  });

  it("부서명을 찾지 못하면 \"해당 부서\"로 폴백한다", async () => {
    // 정답지 N8: 폴백이 없으면 중복 안내 문구를 만들다 부서명에서 터진다(Task 7·9 도 이 경로를 쓴다).
    expect(await lookupDepartmentName(db, null)).toBe("해당 부서");
    expect(await lookupDepartmentName(db, 999999)).toBe("해당 부서");
    expect(await lookupDepartmentName(db, deptA)).toBe("가팀");
  });

  it("검증이 문항번호 검사보다 먼저다", async () => {
    // 정답지 V1: normalize → validate → validateSourceNumber. 내용이 비고 번호도 없으면
    // Spring 은 내용 문구를 낸다 — 두 검사를 맞바꾸면 이 테스트만 빨개진다.
    await expect(createProblem(db, oxRequest({ content: "   ", sourceNumber: null }), deptA, superAdmin))
      .rejects.toMatchObject({ message: "문제 내용을 입력하세요." });
  });

  it("수정도 문항번호가 필수다", async () => {
    // 정답지 N3: validateSourceNumber 는 create·update 두 경로 모두에서 호출된다.
    const id = await createAndReturnId(oxRequest({}));
    await expect(updateProblem(db, id, oxRequest({ sourceNumber: null }), superAdmin))
      .rejects.toMatchObject({ message: "문항 번호를 입력하세요." });
    await expect(updateProblem(db, id, oxRequest({ sourceNumber: 0 }), superAdmin))
      .rejects.toMatchObject({ message: "문항 번호는 1 이상이어야 합니다." });
  });
});
