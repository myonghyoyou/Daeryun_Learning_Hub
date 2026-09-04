import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { asc, eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import {
  auditLogs, departments, excelUploadLogs, problemAnswers, problemChoices, problems, users,
} from "../db/schema";
import { insertProblem } from "../db/problems";
import { findTagNamesByProblemId } from "../db/tags";
import { BizError } from "../http/errors";
import { IMAGE_URL_PREFIX } from "./imageUrl";
import type { AuthUser } from "../auth/types";
import { normalizeExcelTagCell, uploadProblemsExcel } from "./problemExcel";

const HEADER = [
  "문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5",
  "정답", "해설", "태그", "문항번호",
];

type Cell = string | number | null;

function buildExcel(rows: Cell[][], fileName = "problems.xlsx"): { buffer: ArrayBuffer; fileName: string } {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...rows]));
  return { buffer: XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer, fileName };
}

/**
 * SheetJS 는 시트가 0개인 워크북을 write 하지 못한다("Workbook is empty"). 그래서 정상 xlsx 를
 * 만든 뒤 zip 안의 `xl/workbook.xml` 에 있는 `<sheet .../>` 항목만 같은 길이의 공백으로 덮어
 * 시트 목록이 빈 파일을 만든다(XLSX.write 는 기본이 무압축 저장이라 바이트를 그대로 고칠 수
 * 있고, SheetJS 리더는 CRC 를 검사하지 않는다). F4 전용 픽스처다.
 */
function sheetlessWorkbook(): { buffer: ArrayBuffer; fileName: string } {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER]), "Sheet1");
  const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const text = new TextDecoder("latin1").decode(bytes);
  const match = text.match(/<sheet [^>]*\/>/);
  if (!match || match.index === undefined) throw new Error("fixture: <sheet> entry not found");
  const patched = text.slice(0, match.index) + " ".repeat(match[0].length)
    + text.slice(match.index + match[0].length);
  return {
    buffer: Uint8Array.from(patched, (c) => c.charCodeAt(0)).buffer as ArrayBuffer,
    fileName: "nosheet.xlsx",
  };
}

const db = testDb();
let deptA = 0, deptB = 0, deptClosed = 0;
let superAdmin: AuthUser;
let deptAdminOfA: AuthUser;

beforeAll(async () => { await migrateTestDb(); });

beforeEach(async () => {
  await truncateAll();
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
  [{ id: deptClosed }] = await db.insert(departments)
    .values({ name: "폐지팀", code: "C", status: "INACTIVE" }).returning({ id: departments.id });
  const [su] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h",
    departmentId: deptA, role: "SUPER_ADMIN",
  }).returning();
  const [da] = await db.insert(users).values({
    employeeNo: "dept1", name: "부서장", email: "dept1@x.local", passwordHash: "h",
    departmentId: deptA, role: "DEPT_ADMIN",
  }).returning();
  superAdmin = { userId: su.id, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: deptA, mustChangePassword: false, track: "ADMIN" };
  deptAdminOfA = { userId: da.id, employeeNo: "dept1", name: "부서장", role: "DEPT_ADMIN", departmentId: deptA, mustChangePassword: false, track: "ADMIN" };
});

async function seedExisting(sourceNumber: number, departmentId = deptA): Promise<number> {
  return insertProblem(db, {
    type: "OX", content: "기존", status: "ACTIVE", departmentId,
    sourceNumber, createdBy: superAdmin.userId,
  });
}

describe("uploadProblemsExcel — 행별 격리(X22)", () => {
  it("한 행이 실패해도 나머지는 저장된다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "정상1", "", "", "가", "나", "", "", "", "1", "", "", 1],
      ["MCQ_SINGLE", "", "", "", "가", "나", "", "", "", "1", "", "", 2],
      ["MCQ_SINGLE", "정상2", "", "", "가", "나", "", "", "", "1", "", "", 3],
    ]), deptA, "ADMIN", superAdmin);
    expect(res).toMatchObject({ totalRows: 3, successRows: 2, failRows: 1 });
    expect(res.errorDetail).toBe("행 3: 문제유형과 문제내용은 필수입니다.");
    const stored = await db.select().from(problems).orderBy(asc(problems.sourceNumber));
    expect(stored.map((p) => p.content)).toEqual(["정상1", "정상2"]);
  });

  it("DB 쓰기가 실패한 행 앞뒤로 이미 커밋된 행이 살아남는다", async () => {
    // 653행 실적재의 근거. 실패가 검증이 아니라 **DB 쓰기**에서 나는 경우라야 트랜잭션 경계를
    // 실제로 검사한다 — 행 루프를 하나의 db.transaction 으로 감싸면 이 단언이 깨져야 한다.
    await seedExisting(7);
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "앞", "", "", "O", "X", "", "", "", "1", "", "", 1],
      ["OX", "중복", "", "", "O", "X", "", "", "", "1", "", "", 7],
      ["OX", "뒤", "", "", "O", "X", "", "", "", "1", "", "", 9],
    ]), deptA, "ADMIN", superAdmin);
    expect(res).toMatchObject({ totalRows: 3, successRows: 2, failRows: 1 });
    const stored = await db.select().from(problems).orderBy(asc(problems.sourceNumber));
    expect(stored.map((p) => p.content)).toEqual(["앞", "기존", "뒤"]);
    // 실패 행은 문제·보기·감사 어느 것도 남기지 않는다(부분 커밋 금지).
    expect(await db.select().from(problemChoices)).toHaveLength(4);
    const created = (await db.select().from(auditLogs)).filter((a) => a.action === "PROBLEM_CREATED_BY_EXCEL");
    expect(created).toHaveLength(2);
  });

  it("루프가 끝난 뒤 이력 쓰기가 실패해도 이미 커밋된 행은 남는다", async () => {
    // 행 루프를 하나의 트랜잭션으로 감싸는 회귀는 **루프 뒤의 실패**에서만 드러난다 — 행 하나가
    // 실패하는 것만으로는 SAVEPOINT 가 구해 주기 때문이다. 이 테스트가 그 형태를 고정한다.
    // 곁들여 `excel_upload_logs.file_name varchar(255)` 누수를 특성화한다: 파일명이 255자를 넘으면
    // 행은 모두 커밋된 뒤 이력 insert 가 실패해 호출 전체가 던진다. Spring 도 같은 모양이라
    // 여기서 고치지 않는다(M7 컷오버 이월) — 다만 동작을 스위트에 기록해 둔다.
    const longName = `${"x".repeat(300)}.xlsx`;
    await expect(uploadProblemsExcel(db, buildExcel([
      ["OX", "앞", "", "", "O", "X", "", "", "", "1", "", "", 1],
      ["OX", "뒤", "", "", "O", "X", "", "", "", "1", "", "", 2],
    ], longName), deptA, "ADMIN", superAdmin)).rejects.toThrow(/character varying\(255\)/);
    const stored = await db.select().from(problems).orderBy(asc(problems.sourceNumber));
    expect(stored.map((p) => p.content)).toEqual(["앞", "뒤"]);
    expect(await db.select().from(excelUploadLogs)).toHaveLength(0);
  });
});

describe("uploadProblemsExcel — 행 검증(X 구획)", () => {
  it("X2: 유형·내용 누락", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
      ["OX", "  ", "", "", "O", "X", "", "", "", "1", "", "", 2],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 문제유형과 문제내용은 필수입니다.",
      "행 3: 문제유형과 문제내용은 필수입니다.",
    ]);
  });

  it("X3: FILL_BLANK 는 거부한다(대소문자 무관)", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["FILL_BLANK", "가", "", "", "", "", "", "", "", "", "", "", 1],
      ["fill_blank", "나", "", "", "", "", "", "", "", "", "", "", 2],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요.",
      "행 3: 빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요.",
    ]);
  });

  it("X4: 알 수 없는 유형은 원문을 붙여 알린다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["객관식", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 유효하지 않은 문제유형입니다: 객관식");
  });

  it("X5: 번호가 없으면 그 행이 실패한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", null],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 문항 번호는 필수입니다.");
  });

  it("X6: 번호가 숫자가 아니면 원문을 붙여 알린다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", "12번"],
      ["OX", "나", "", "", "O", "X", "", "", "", "1", "", "", "1.5"],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 문항 번호는 숫자여야 합니다: 12번",
      "행 3: 문항 번호는 숫자여야 합니다: 1.5",
    ]);
  });

  it("X7: 번호가 1 미만", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 0],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 문항 번호는 1 이상이어야 합니다: 0");
  });

  it("X8: 파일 안 번호 중복은 그 행만 실패한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 11],
      ["OX", "나", "", "", "O", "X", "", "", "", "1", "", "", 11],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.failRows).toBe(1);
    expect(res.errorDetail).toBe("행 3: 파일 안에서 문항 번호가 중복됩니다: 11");
  });

  it("X8: 뒤에서 실패한 행의 번호도 파일 안에서 이미 쓴 것으로 친다", async () => {
    // Java 는 seenSourceNumbers.add 를 검증 도중에 해서, 그 뒤 단계에서 실패한 행의 번호도
    // 파일 안에서 소비된다. 이 순서를 바꾸면 두 번째 행이 다른 문구로 실패한다.
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "", "", "", 5],
      ["OX", "나", "", "", "O", "X", "", "", "", "1", "", "", 5],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 정답은 필수입니다.",
      "행 3: 파일 안에서 문항 번호가 중복됩니다: 5",
    ]);
  });

  it("X9: 태그가 20개를 넘거나 100자를 넘으면 그 행만 실패한다(배치는 계속된다)", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `t${i}`).join(",");
    const tooLong = "가".repeat(101);
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", tooMany, 1],
      ["OX", "나", "", "", "O", "X", "", "", "", "1", "", tooLong, 2],
      ["OX", "다", "", "", "O", "X", "", "", "", "1", "", "회계, 회계 , 세무", 3],
    ]), deptA, "ADMIN", superAdmin);
    expect(res).toMatchObject({ totalRows: 3, successRows: 1, failRows: 2 });
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 태그는 문제당 20개, 태그명은 100자 이하여야 합니다.",
      "행 3: 태그는 문제당 20개, 태그명은 100자 이하여야 합니다.",
    ]);
    const [saved] = await db.select().from(problems);
    expect(await findTagNamesByProblemId(db, saved.id)).toEqual(["세무", "회계"]);
  });

  it("X10: 정답 셀이 비면 실패한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 정답은 필수입니다.");
  });

  it("X11: 이미지 열이 유효한 경로가 아니면 거부한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "/x.png", "", "O", "X", "", "", "", "1", "", "", 1],
      // 접두어는 맞지만 `..` 로 탈출하는 행. M6 가 IMAGE_URL_PREFIX 를 바꿔도
      // 이 행이 계속 "탈출" 분기를 타도록 상수에서 조립한다(리터럴이면 접두어 불일치로 바뀌어 이름과 다른 것을 검사하게 된다).
      ["OX", "나", `${IMAGE_URL_PREFIX}../secret.png`, "", "O", "X", "", "", "", "1", "", "", 2],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.failRows).toBe(2);
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요.",
      "행 3: 이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요.",
    ]);
  });

  it("X11: 이미 유효한 /api/problem-images/ 경로는 그대로 저장된다(빈 열 강제 아님)", async () => {
    // 정답지 X11: 이 리터럴은 M6 의 IMAGE_URL_PREFIX 값을 그대로 박아 둔 플립 감지용이다 —
    // 접두어가 바뀌면 이 테스트가 의도적으로 깨져 상수와 리터럴이 어긋났음을 알린다.
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "/api/problem-images/a.png", "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.successRows).toBe(1);
    const [saved] = await db.select().from(problems);
    expect(saved.imageUrl).toBe("/api/problem-images/a.png");
  });

  it("X11: 500자를 넘는 경로는 접두어가 맞아도 거부한다(TOO_LONG)", async () => {
    // 길이 초과만으로 거부되는지 보는 행 — 접두어는 반드시 유효해야 하므로 M6 이후에도 상수를 따른다.
    const overlong = `${IMAGE_URL_PREFIX}${"a".repeat(500)}.png`;
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", overlong, "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요.");
  });

  it("X12: 보기 개수 위반", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "가", "", "", "하나", "", "", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 보기는 2개 이상 5개 이하이어야 합니다.");
  });

  it("X13: 중간이 빈 보기는 앞으로 당기지 않고 거부한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "가", "", "", "하나", "둘", "", "넷", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 빈 보기는 입력할 수 없습니다.");
  });

  it("X14: OX 는 보기가 정확히 2개여야 한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "몰라", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: OX 문제는 보기 2개(O/X)가 필요합니다.");
  });

  it("X15: 정답 셀이 보기 번호로 파싱되지 않으면 원문을 붙여 알린다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "가", "", "", "하나", "둘", "", "", "", "정답1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 정답은 보기 번호(1부터 시작)여야 합니다: 정답1");
  });

  it("X16: 정답 번호가 보기 범위를 벗어남", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "가", "", "", "하나", "둘", "", "", "", "3", "", "", 1],
      ["MCQ_SINGLE", "나", "", "", "하나", "둘", "", "", "", "0", "", "", 2],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 정답 번호가 보기 범위를 벗어났습니다: 3",
      "행 3: 정답 번호가 보기 범위를 벗어났습니다: 0",
    ]);
  });

  it("X17: MCQ_MULTI 가 아닌 유형은 고유 정답이 1개여야 한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "가", "", "", "하나", "둘", "", "", "", "1,2", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 이 유형은 정답이 1개여야 합니다.");
  });

  it("X17: 같은 번호를 두 번 써도 고유 정답이 1개면 통과한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "가", "", "", "하나", "둘", "", "", "", "2,2", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.successRows).toBe(1);
    const rows = await db.select().from(problemChoices).orderBy(asc(problemChoices.displayOrder));
    expect(rows.map((c) => c.isCorrect)).toEqual([false, true]);
  });

  it("X18: MCQ_MULTI 인데 고유 정답이 0개", async () => {
    // 정답 셀 ",," 는 공백이 아니라 X10 을 지나지만, Java split(",") 이 뒤쪽 빈 조각을 모두
    // 버려 정답 목록이 비게 된다 — 이 유형만 도달하는 갈래다.
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_MULTI", "가", "", "", "하나", "둘", "", "", "", ",,", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 정답을 최소 1개 선택하세요.");
  });

  it("X19: SHORT_ANSWER 는 콤마 사이의 빈 토큰을 거부한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["SHORT_ANSWER", "가", "", "", "", "", "", "", "", "서울,,Seoul", "", "", 1],
      ["SHORT_ANSWER", "나", "", "", "", "", "", "", "", "서울,", "", "", 2],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.failRows).toBe(2);
    expect(res.errorDetail!.split("\n")).toEqual([
      "행 2: 빈 정답은 입력할 수 없습니다.",
      "행 3: 빈 정답은 입력할 수 없습니다.",
    ]);
  });

  it("SHORT_ANSWER 는 보기 열을 보지 않고 정답만 나눠 저장한다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["SHORT_ANSWER", "수도는?", "", "", "", "", "", "", "", " 서울 , Seoul ", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.successRows).toBe(1);
    const rows = await db.select().from(problemAnswers).orderBy(asc(problemAnswers.id));
    expect(rows.map((a) => a.answerText)).toEqual(["서울", "Seoul"]);
  });

  it("X20: DB 중복은 일반 문구에 묻히지 않는다", async () => {
    await seedExisting(7);
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 7],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBe("행 2: 문항 번호 7번은 이 부서에 이미 있습니다.");
  });

  it("X20: 다른 부서의 같은 번호는 중복이 아니다", async () => {
    await seedExisting(7, deptB);
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 7],
    ]), deptA, "ADMIN", superAdmin);
    expect(res).toMatchObject({ successRows: 1, failRows: 0, errorDetail: null });
  });

  it("X21: 중복이 아닌 저장 실패는 일반 문구로 안내한다(이탈 ⑦)", async () => {
    // 보기 텍스트에는 엑셀 경로의 길이 검증이 없어 varchar(500) 제약까지 그대로 도달한다.
    const overlong = "가".repeat(600);
    const res = await uploadProblemsExcel(db, buildExcel([
      ["MCQ_SINGLE", "가", "", "", overlong, "둘", "", "", "", "1", "", "", 1],
      ["OX", "나", "", "", "O", "X", "", "", "", "1", "", "", 2],
    ]), deptA, "ADMIN", superAdmin);
    expect(res).toMatchObject({ successRows: 1, failRows: 1 });
    expect(res.errorDetail).toBe("행 2: 문제 저장 중 오류가 발생했습니다.");
    expect((await db.select().from(problems)).map((p) => p.content)).toEqual(["나"]);
  });

  it("X1·X23: 열 순서대로 읽고, 셀 값은 trim 하며 없는 셀은 빈 값으로 본다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      [" MCQ_MULTI ", " 본문 ", "", " 참조 ", " 하나 ", " 둘 ", " 셋 ", "", "", " 1 , 3 ", " 해설 ", " 회계 ", " 4 "],
      ["OX", "짧은행", "", "", "O", "X", "", "", "", "1"], // 태그·번호 열이 아예 없는 행
    ]), deptA, "ADMIN", superAdmin);
    expect(res).toMatchObject({ totalRows: 2, successRows: 1, failRows: 1 });
    expect(res.errorDetail).toBe("행 3: 문항 번호는 필수입니다.");
    const [saved] = await db.select().from(problems);
    expect(saved).toMatchObject({
      type: "MCQ_MULTI", content: "본문", referenceText: "참조", explanation: "해설",
      imageUrl: null, blankRevealCount: null, status: "ACTIVE",
      departmentId: deptA, sourceNumber: 4, createdBy: superAdmin.userId,
    });
    const choices = await db.select().from(problemChoices).orderBy(asc(problemChoices.displayOrder));
    expect(choices.map((c) => [c.choiceText, c.isCorrect, c.displayOrder]))
      .toEqual([["하나", true, 1], ["둘", false, 2], ["셋", true, 3]]);
    expect(await findTagNamesByProblemId(db, saved.id)).toEqual(["회계"]);
  });

  it("A5: 성공 행마다 PROBLEM_CREATED_BY_EXCEL 감사를 남긴다", async () => {
    await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    const logs = (await db.select().from(auditLogs)).filter((a) => a.action === "PROBLEM_CREATED_BY_EXCEL");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ targetType: "PROBLEM", actorId: superAdmin.userId, detail: { type: "OX" } });
  });
});

describe("uploadProblemsExcel — 파일 수준(F 구획)", () => {
  it("F2: xlsx·xls 가 아니면 1014 로 거부한다", async () => {
    const err = await uploadProblemsExcel(db, buildExcel([], "problems.csv"), deptA, "ADMIN", superAdmin)
      .then(() => null, (e) => e as BizError);
    expect(err).toBeInstanceOf(BizError);
    expect((err as BizError).errorCode.code).toBe(1014);
    expect((err as BizError).message).toBe("xlsx 또는 xls 엑셀 파일만 업로드할 수 있습니다.");
  });

  it("F3: 열 수 없는 파일은 1013 이다", async () => {
    const junk = new TextEncoder().encode("this is not xlsx").buffer as ArrayBuffer;
    const err = await uploadProblemsExcel(db, { buffer: junk, fileName: "junk.xlsx" }, deptA, "ADMIN", superAdmin)
      .then(() => null, (e) => e as BizError);
    expect((err as BizError).errorCode.code).toBe(1013);
    expect((err as BizError).message).toBe("엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요.");
  });

  it("F4: 시트가 없으면 1013 이고 문구가 계정 업로드와 다르다", async () => {
    const err = await uploadProblemsExcel(db, sheetlessWorkbook(), deptA, "ADMIN", superAdmin)
      .then(() => null, (e) => e as BizError);
    expect((err as BizError).errorCode.code).toBe(1013);
    expect((err as BizError).message).toBe("엑셀 파일에 시트가 없습니다. 첫 번째 시트에 문제 목록을 담아 다시 올려 주세요.");
  });

  it("F5: 501행이면 처리 전에 전체를 거부한다", async () => {
    const rows = Array.from({ length: 501 }, (_, i): Cell[] =>
      ["OX", `문항${i}`, "", "", "O", "X", "", "", "", "1", "", "", i + 1]);
    const err = await uploadProblemsExcel(db, buildExcel(rows), deptA, "ADMIN", superAdmin)
      .then(() => null, (e) => e as BizError);
    expect(err).toBeInstanceOf(BizError);
    expect((err as BizError).errorCode.code).toBe(1000);
    expect((err as BizError).message).toBe("한 번에 업로드할 수 있는 데이터 행은 최대 500건입니다. 파일을 나눠 업로드하세요.");
    expect(await db.select().from(problems)).toHaveLength(0);
    expect(await db.select().from(excelUploadLogs)).toHaveLength(0);
  });

  it("F5: 500행은 통과한다", async () => {
    const rows = Array.from({ length: 500 }, (_, i): Cell[] =>
      ["OX", `문항${i}`, "", "", "O", "X", "", "", "", "1", "", "", i + 1]);
    const res = await uploadProblemsExcel(db, buildExcel(rows), deptA, "ADMIN", superAdmin);
    expect(res).toMatchObject({ totalRows: 500, successRows: 500, failRows: 0 });
  }, 120_000);

  it("F6·R8: 부서 스코프를 행 파싱보다 먼저 확정한다", async () => {
    // 파일은 열 수도 없는 쓰레기지만, 부서 해석이 먼저라 1013 이 아니라 부서 문구가 나온다.
    const junk = new TextEncoder().encode("not xlsx").buffer as ArrayBuffer;
    await expect(uploadProblemsExcel(db, { buffer: junk, fileName: "j.xlsx" }, null, "ADMIN", superAdmin))
      .rejects.toMatchObject({ message: "문제가 귀속될 부서를 선택하세요." });
  });

  it("R10: 비활성 부서로는 업로드할 수 없다", async () => {
    await expect(uploadProblemsExcel(db, buildExcel([]), deptClosed, "ADMIN", superAdmin))
      .rejects.toMatchObject({ message: "비활성 부서에는 문제를 등록할 수 없습니다: 폐지팀" });
  });
});

describe("uploadProblemsExcel — 업로드 이력(A6)", () => {
  it("업로드 이력을 남기고 귀속 부서가 문제 행과 같다", async () => {
    await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
      ["OX", "", "", "", "O", "X", "", "", "", "1", "", "", 2],
    ], "문제.xlsx"), deptA, "ADMIN", superAdmin);
    const [log] = await db.select().from(excelUploadLogs);
    expect(log).toMatchObject({
      targetType: "PROBLEM", departmentId: deptA, uploadedBy: superAdmin.userId,
      fileName: "문제.xlsx", totalRows: 2, successRows: 1, failRows: 1,
    });
    expect(log.errorDetail).toBe("행 3: 문제유형과 문제내용은 필수입니다.");
    const [saved] = await db.select().from(problems);
    expect(saved.departmentId).toBe(log.departmentId);
    const [audit] = (await db.select().from(auditLogs)).filter((a) => a.action === "PROBLEM_EXCEL_UPLOADED");
    expect(audit).toMatchObject({ targetType: "EXCEL_UPLOAD_LOG", targetId: log.id, actorId: superAdmin.userId });
    expect(audit.detail).toEqual({
      fileName: "문제.xlsx", totalRows: 2, successRows: 1, failRows: 1, departmentId: deptA,
    });
  });

  it("실패가 없으면 errorDetail 은 null 이다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    expect(res.errorDetail).toBeNull();
    const [log] = await db.select().from(excelUploadLogs);
    expect(log.errorDetail).toBeNull();
  });

  it("부서 관리자가 올리면 문제도 이력도 본인 부서다(R5)", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptB, "ADMIN", deptAdminOfA);
    expect(res.successRows).toBe(1);
    const [log] = await db.select().from(excelUploadLogs);
    expect(log.departmentId).toBe(deptA); // 요청한 deptB 가 아니다
    const [saved] = await db.select().from(problems);
    expect(saved.departmentId).toBe(deptA);
    expect(saved.createdBy).toBe(deptAdminOfA.userId);
  });

  it("데이터 행이 하나도 없어도 이력은 남는다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([]), deptA, "ADMIN", superAdmin);
    expect(res).toEqual({ totalRows: 0, successRows: 0, failRows: 0, errorDetail: null });
    const logs = await db.select().from(excelUploadLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ totalRows: 0, departmentId: deptA });
  });
});

describe("uploadProblemsExcel — 태그 재사용", () => {
  it("같은 태그를 쓴 여러 행이 태그 행을 하나만 만든다", async () => {
    await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "회계", 1],
      ["OX", "나", "", "", "O", "X", "", "", "", "1", "", "회계,세무", 2],
    ]), deptA, "ADMIN", superAdmin);
    const saved = await db.select().from(problems).orderBy(asc(problems.sourceNumber));
    expect(await findTagNamesByProblemId(db, saved[0].id)).toEqual(["회계"]);
    expect(await findTagNamesByProblemId(db, saved[1].id)).toEqual(["세무", "회계"]);
  });

  it("영문 태그는 소문자로 접힌다", async () => {
    await uploadProblemsExcel(db, buildExcel([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "Finance, FINANCE", 1],
    ]), deptA, "ADMIN", superAdmin);
    const [saved] = await db.select().from(problems);
    expect(await findTagNamesByProblemId(db, saved.id)).toEqual(["finance"]);
  });
});

describe("normalizeExcelTagCell — X24 (던지지 않는 변형)", () => {
  it("trim → 빈 것 제거 → 소문자 → 중복 제거 순으로 정규화한다", () => {
    expect(normalizeExcelTagCell(" 회계 , ,Finance, FINANCE ,회계")).toEqual(["회계", "finance"]);
    expect(normalizeExcelTagCell("")).toEqual([]);
    expect(normalizeExcelTagCell(",,")).toEqual([]);
  });

  it("위반하면 던지지 않고 null 을 돌려준다 — 한 행의 태그 위반이 배치를 멈추면 안 된다", () => {
    // problemValidation.normalizeTags 와 규칙은 같지만 그쪽은 BizError 를 던진다. 이 변형이
    // 던지면 태그 21개짜리 행 하나가 파일 전체를 거절한다.
    expect(normalizeExcelTagCell(Array.from({ length: 21 }, (_, i) => `t${i}`).join(","))).toBeNull();
    expect(normalizeExcelTagCell("가".repeat(101))).toBeNull();
    expect(normalizeExcelTagCell(Array.from({ length: 20 }, (_, i) => `t${i}`).join(","))).toHaveLength(20);
    expect(normalizeExcelTagCell("가".repeat(100))).toHaveLength(1);
  });
});

describe("uploadProblemsExcel — 레거시 xls", () => {
  it("xls(OLE2) 파일도 받는다", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      HEADER, ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
    ]));
    const buffer = XLSX.write(wb, { type: "array", bookType: "xls" }) as ArrayBuffer;
    const res = await uploadProblemsExcel(db, { buffer, fileName: "legacy.xls" }, deptA, "ADMIN", superAdmin);
    expect(res.successRows).toBe(1);
    const rows = await db.select().from(problems).where(eq(problems.sourceNumber, 1));
    expect(rows).toHaveLength(1);
  });
});

describe("직군", () => {
  it("엑셀로 올린 문제에 화면에서 고른 직군이 붙는다", async () => {
    const res = await uploadProblemsExcel(db, buildExcel([
      ["OX", "가스 문제", "", "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptA, "TECH", superAdmin);
    expect(res.successRows).toBe(1);
    const [row] = await db.select().from(problems);
    expect(row.track).toBe("TECH");
  });

  // 엑셀 열이 아니라 화면에서 고른다 — 파일 형식은 13컬럼 그대로다.
  it("직군을 안 고르면 행정직으로 들어간다", async () => {
    await uploadProblemsExcel(db, buildExcel([
      ["OX", "행정 문제", "", "", "O", "X", "", "", "", "1", "", "", 1],
    ]), deptA, "ADMIN", superAdmin);
    const [row] = await db.select().from(problems);
    expect(row.track).toBe("ADMIN");
  });
});
