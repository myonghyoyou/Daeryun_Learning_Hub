import * as XLSX from "xlsx";
import type { Db } from "../db/client";
import { insertProblem } from "../db/problems";
import { findOrCreateTagsByNames, replaceProblemTags } from "../db/tags";
import { recordAudit } from "../audit/auditLog";
import { excelUploadLogs } from "../db/schema";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser } from "../auth/types";
import { checkImageUrl } from "./imageUrl";
import type { ProblemCreateInput, ProblemType } from "./problemValidation";
import { isDuplicateSourceNumber, saveTypeSpecificData } from "./problemService";
import { resolveOwningDepartment } from "./owningDepartment";

/**
 * 문제 엑셀 일괄 등록(ExcelProblemUploadServiceImpl.java 이식, 정답지 X·F 구획).
 *
 * 셀 파싱을 여기서 직접 한다 — `problemRequestBody.ts`(JSON 본문 매퍼)는 읽기 실패마다 **던지므로**,
 * 셀 하나가 깨진 행이 아래의 행별 try 를 뛰어넘어 파일 전체를 거절해 버린다(그 파일의 docstring 이
 * 밝히고 있는 용도 제한이다). 여기서는 `ProblemCreateInput` 의 **모양만** 재사용해
 * `saveTypeSpecificData` 에 넘긴다.
 */

const HEADER_ROW_COUNT = 1;
const MAX_DATA_ROWS = 500;
const MAX_CHOICE_COLUMNS = 5;
const MIN_CHOICES = 2;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;
const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;

// 컬럼 순서 고정(정답지 X1): 0 유형 · 1 내용 · 2 이미지 · 3 참조지문 · 4~8 보기1~5 ·
// 9 정답 · 10 해설 · 11 태그 · 12 문항번호.
const COL_TYPE = 0;
const COL_CONTENT = 1;
const COL_IMAGE = 2;
const COL_REFERENCE = 3;
const COL_CHOICE_START = 4;
const COL_ANSWER = 9;
const COL_EXPLANATION = 10;
const COL_TAGS = 11;
const COL_SOURCE_NUMBER = 12;

const UNREADABLE = "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요.";
const IMAGE_NOT_ALLOWED =
  "이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요.";

const PROBLEM_TYPES: readonly string[] = ["MCQ_SINGLE", "MCQ_MULTI", "OX", "SHORT_ANSWER", "FILL_BLANK"];

export interface ExcelResult {
  totalRows: number;
  successRows: number;
  failRows: number;
  errorDetail: string | null;
}

interface RowOutcome {
  rowNumber: number;
  success: boolean;
  reason: string | null;
}

/** X23: 없는 셀은 `""`(예외 아님), 있으면 표시 문자열을 trim 한 값. */
function cell(row: unknown[], index: number): string {
  const value = row[index];
  return value == null ? "" : String(value).trim();
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function emptyToNull(value: string): string | null {
  return isBlank(value) ? null : value;
}

/**
 * Java `String.split(",")` 미러 — 뒤쪽 빈 조각을 버린다("1," → ["1"]). JS 기본 split 은 남기므로
 * 그대로 쓰면 "1," 이 X15("정답은 보기 번호…")로 잘못 떨어진다. 서술형은 반대로 `split(",", -1)`
 * 이라 빈 토큰을 남겨야 X19 가 성립한다 — 그쪽은 JS 기본 split 이 곧 그 동작이다.
 */
function javaSplit(value: string): string[] {
  if (value === "") return [""];
  const parts = value.split(",");
  let end = parts.length;
  while (end > 0 && parts[end - 1] === "") end -= 1;
  return parts.slice(0, end);
}

/** Java `Integer.parseInt` 미러: 부호+숫자만, int 범위 밖은 실패(null). */
function parseJavaInt(text: string): number | null {
  if (!/^[+-]?\d+$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n > INT32_MAX || n < INT32_MIN) return null;
  return n;
}

/**
 * 엑셀 전용 태그 정규화(정답지 X24). `problemValidation.ts` 의 `normalizeTags` 와 규칙은 같지만
 * 입력이 **콤마로 구분된 문자열 하나**이고, 위반 시 던지지 않고 `null` 을 돌려준다 — 한 행의 태그
 * 위반이 배치 전체를 중단시키면 안 되기 때문이다(Java javadoc 이 명시한 의도).
 */
export function normalizeExcelTagCell(tagCell: string): string[] | null {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tagCell.split(",")) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    normalized.push(lower);
  }
  if (normalized.length > MAX_TAGS || normalized.some((t) => t.length > MAX_TAG_LENGTH)) return null;
  return normalized;
}

function validateExtension(fileName: string | null | undefined): void {
  const lower = (fileName ?? "").toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new BizError(ErrorCode.FILE_TYPE_NOT_ALLOWED, "xlsx 또는 xls 엑셀 파일만 업로드할 수 있습니다.");
  }
}

function readSheetRows(buffer: ArrayBuffer): string[][] {
  try {
    const bytes = new Uint8Array(buffer);
    // SheetJS 는 비엑셀 텍스트도 CSV 로 관대하게 파싱해 예외를 던지지 않으므로 서명으로 먼저
    // 걸러낸다(계정 업로드와 동일). xlsx = zip("PK"), 레거시 xls = OLE2/CFB.
    const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    const isOle2 = bytes.length >= 8 && OLE2.every((b, i) => bytes[i] === b);
    if (!isZip && !isOle2) throw new BizError(ErrorCode.FILE_UNREADABLE, UNREADABLE);

    const workbook = XLSX.read(bytes, { type: "array" });
    if (workbook.SheetNames.length === 0) {
      // 계정 업로드와 문구가 다르다(정답지 F4).
      throw new BizError(ErrorCode.FILE_UNREADABLE,
        "엑셀 파일에 시트가 없습니다. 첫 번째 시트에 문제 목록을 담아 다시 올려 주세요.");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw:false = POI DataFormatter 대응(표시 문자열), blankrows:false = 빈 행 스킵(승인된 이탈 ④).
    return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  } catch (error) {
    if (error instanceof BizError) throw error;
    throw new BizError(ErrorCode.FILE_UNREADABLE, UNREADABLE);
  }
}

type ParsedRow = { input: ProblemCreateInput; sourceNumber: number; tags: string[]; imageUrl: string | null;
  referenceText: string | null; explanation: string | null };

/**
 * 한 행을 검증해 저장 가능한 모양으로 바꾼다. 실패하면 문자열(사유)을 돌려준다 — Java processRow
 * 의 검사 **순서**를 그대로 지킨다: 유형·내용 → FILL_BLANK → 유형 유효성 → 번호(필수·숫자·범위·
 * 파일 내 중복) → 태그 → 정답 필수 → 이미지 → 유형별 규칙. 순서를 바꾸면 같은 행이 다른 문구로
 * 실패한다.
 */
function parseRow(row: string[], seenSourceNumbers: Set<number>): ParsedRow | string {
  const typeText = cell(row, COL_TYPE);
  const content = cell(row, COL_CONTENT);

  if (isBlank(typeText) || isBlank(content)) return "문제유형과 문제내용은 필수입니다.";
  if (typeText.toUpperCase() === "FILL_BLANK") {
    return "빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요.";
  }
  if (!PROBLEM_TYPES.includes(typeText)) return `유효하지 않은 문제유형입니다: ${typeText}`;
  const type = typeText as ProblemType;

  const answerText = cell(row, COL_ANSWER);

  const sourceNumberText = cell(row, COL_SOURCE_NUMBER);
  if (isBlank(sourceNumberText)) return "문항 번호는 필수입니다.";
  const sourceNumber = parseJavaInt(sourceNumberText);
  if (sourceNumber === null) return `문항 번호는 숫자여야 합니다: ${sourceNumberText}`;
  if (sourceNumber < 1) return `문항 번호는 1 이상이어야 합니다: ${sourceNumber}`;
  // 파일 안 중복을 DB 에 닿기 전에 잡는다. 뒤에서 실패할 행이라도 번호는 여기서 소비된다 —
  // Java 도 검증 도중에 add 한다.
  if (seenSourceNumbers.has(sourceNumber)) return `파일 안에서 문항 번호가 중복됩니다: ${sourceNumber}`;
  seenSourceNumbers.add(sourceNumber);

  const tags = normalizeExcelTagCell(cell(row, COL_TAGS));
  if (tags === null) return "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.";
  if (isBlank(answerText)) return "정답은 필수입니다.";

  const imageUrl = emptyToNull(cell(row, COL_IMAGE));
  // 빈 열 강제가 아니다 — 이미 유효한 /uploads/images/... 경로는 통과한다(정답지 X11).
  if (checkImageUrl(imageUrl) !== "VALID") return IMAGE_NOT_ALLOWED;

  const base = {
    sourceNumber, tags, imageUrl,
    referenceText: emptyToNull(cell(row, COL_REFERENCE)),
    explanation: emptyToNull(cell(row, COL_EXPLANATION)),
  };

  if (type === "SHORT_ANSWER") {
    // split(",", -1) 미러: 빈 토큰을 남겨 둬야 "서울,,Seoul" 이 거부된다(정답지 X19).
    const answers = answerText.split(",").map((t) => t.trim());
    if (answers.some((t) => t === "")) return "빈 정답은 입력할 수 없습니다.";
    return { ...base, input: { type, content, answers } };
  }
  return parseChoiceRow(row, type, content, answerText, base);
}

function parseChoiceRow(
  row: string[], type: ProblemType, content: string, answerText: string,
  base: Omit<ParsedRow, "input">,
): ParsedRow | string {
  const choiceCells = Array.from({ length: MAX_CHOICE_COLUMNS }, (_, i) => cell(row, COL_CHOICE_START + i));
  let lastNonBlank = -1;
  for (let i = MAX_CHOICE_COLUMNS - 1; i >= 0; i -= 1) {
    if (!isBlank(choiceCells[i])) { lastNonBlank = i; break; }
  }
  const choiceCount = lastNonBlank + 1;

  // 개수 검사 먼저, 그 다음 빈 보기 검사(ProblemServiceImpl.validateChoices 와 같은 순서).
  if (choiceCount < MIN_CHOICES || choiceCount > MAX_CHOICE_COLUMNS) {
    return "보기는 2개 이상 5개 이하이어야 합니다.";
  }
  const choiceTexts: string[] = [];
  for (let i = 0; i < choiceCount; i += 1) {
    // 뒤 열에 값이 있는데 앞 열이 비면 "보기 번호 = 열 번호" 대응이 깨진다. 당겨 채우면 정답
    // 번호가 엉뚱한 보기를 가리키는 조용한 오답 버그가 된다(정답지 X13).
    if (isBlank(choiceCells[i])) return "빈 보기는 입력할 수 없습니다.";
    choiceTexts.push(choiceCells[i]);
  }
  if (type === "OX" && choiceTexts.length !== 2) return "OX 문제는 보기 2개(O/X)가 필요합니다.";

  const correctIndexes: number[] = [];
  for (const token of javaSplit(answerText)) {
    const parsed = parseJavaInt(token.trim());
    if (parsed === null) return `정답은 보기 번호(1부터 시작)여야 합니다: ${answerText}`;
    correctIndexes.push(parsed);
  }
  for (const index of correctIndexes) {
    if (index < 1 || index > choiceTexts.length) return `정답 번호가 보기 범위를 벗어났습니다: ${index}`;
  }
  const distinctCorrect = new Set(correctIndexes).size;
  if (type !== "MCQ_MULTI" && distinctCorrect !== 1) return "이 유형은 정답이 1개여야 합니다.";
  if (type === "MCQ_MULTI" && distinctCorrect < 1) return "정답을 최소 1개 선택하세요.";

  return {
    ...base,
    input: {
      type, content,
      choices: choiceTexts.map((text, i) => ({ text, correct: correctIndexes.includes(i + 1) })),
    },
  };
}

/**
 * 문제 엑셀 일괄 등록. **`db` 는 `Db` 지 `DbConn` 이 아니다 — 의도적이다.** 아래 행 루프는 행마다
 * 독립 트랜잭션을 열어야 하는데(Spring `@Transactional(REQUIRES_NEW)` 미러, 정답지 X22), Drizzle 은
 * **중첩** transaction 을 SAVEPOINT 로 바꾸므로 이 함수에 트랜잭션 핸들이 들어오면 "커밋된" 행이
 * 전부 바깥 트랜잭션에 종속돼 나중의 실패 하나로 통째로 사라질 수 있다. 타입이 그 호출을 막는다.
 * 같은 이유로 이 함수 안에서 행 루프를 `db.transaction(...)` 으로 감싸서는 안 된다.
 */
export async function uploadProblemsExcel(
  db: Db,
  file: { buffer: ArrayBuffer; fileName: string },
  requestedDepartmentId: number | null,
  actor: AuthUser,
): Promise<ExcelResult> {
  validateExtension(file.fileName);
  // 부서 스코프는 행 파싱보다 먼저 확정한다(정답지 F6). 부서 관리자는 요청값이 무시된다(R5).
  const effectiveDepartmentId = await resolveOwningDepartment(db, requestedDepartmentId, actor);

  const rows = readSheetRows(file.buffer);
  const dataRows = rows.slice(HEADER_ROW_COUNT);
  // 한 행도 처리하기 전에 상한을 확인한다 — 처리 중에 끊으면 이미 커밋된 문제가 남는다(정답지 F5).
  if (dataRows.length > MAX_DATA_ROWS) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID,
      `한 번에 업로드할 수 있는 데이터 행은 최대 ${MAX_DATA_ROWS}건입니다. 파일을 나눠 업로드하세요.`);
  }

  // 부서명은 여기서 조회하지 않는다. 엑셀 경로의 중복 안내는 부서명을 쓰지 않고
  // ("문항 번호 <n>번은 이 부서에 이미 있습니다.", 정답지 X20) `lookupDepartmentName` 을 행의 catch
  // 안에서 부르는 것이 바로 QA-1 결함이다 — 실패로 abort 된 트랜잭션 위에서 SELECT 하면 안내
  // 문구가 만들어지기도 전에 새 예외가 난다. 필요해지면 **루프 밖에서 한 번만** 읽을 것.
  const outcomes: RowOutcome[] = [];
  const seenSourceNumbers = new Set<number>();

  for (let i = 0; i < dataRows.length; i += 1) {
    const rowNumber = i + HEADER_ROW_COUNT + 1; // 엑셀 표기 행 번호(헤더=1행)
    const parsed = parseRow(dataRows[i], seenSourceNumbers);
    if (typeof parsed === "string") {
      outcomes.push({ rowNumber, success: false, reason: parsed });
      continue;
    }
    try {
      // 행마다 독립 트랜잭션 — 이 행의 실패는 이 행만 롤백하고, 이미 커밋된 행은 건드리지 않는다.
      await db.transaction(async (tx) => {
        const problemId = await insertProblem(tx, {
          type: parsed.input.type,
          content: parsed.input.content!,
          imageUrl: parsed.imageUrl,
          referenceText: parsed.referenceText,
          explanation: parsed.explanation,
          blankRevealCount: null, // FILL_BLANK 는 엑셀로 만들 수 없다(정답지 X3·V31)
          status: "ACTIVE",
          departmentId: effectiveDepartmentId,
          sourceNumber: parsed.sourceNumber,
          createdBy: actor.userId,
        });
        await saveTypeSpecificData(tx, problemId, parsed.input);
        await replaceProblemTags(tx, problemId, await findOrCreateTagsByNames(tx, parsed.tags));
        await recordAudit(tx, {
          actorId: actor.userId, action: "PROBLEM_CREATED_BY_EXCEL", targetType: "PROBLEM",
          targetId: problemId, detail: { type: parsed.input.type },
        });
      });
      outcomes.push({ rowNumber, success: true, reason: null });
    } catch (error) {
      // 판정은 `isDuplicateSourceNumber` 하나로 모은다(정답지 N6, 승인된 이탈 ⑦).
      // `instanceof BizError` 로 우회하면 이 트랜잭션 안에서 던지는 다른 BizError(예: 동시 업로드의
      // 태그 UNIQUE 위반 번역)까지 문항 번호 탓으로 둔갑한다.
      if (!isDuplicateSourceNumber(error)) {
        console.warn(`행 ${rowNumber} 문제 저장 실패`, error);
      }
      outcomes.push({
        rowNumber, success: false,
        reason: isDuplicateSourceNumber(error)
          ? `문항 번호 ${parsed.sourceNumber}번은 이 부서에 이미 있습니다.`
          : "문제 저장 중 오류가 발생했습니다.",
      });
    }
  }

  const successRows = outcomes.filter((o) => o.success).length;
  const failures = outcomes.filter((o) => !o.success);
  const errorDetail = failures.length === 0
    ? null
    : failures.map((f) => `행 ${f.rowNumber}: ${f.reason}`).join("\n");

  // 업로드 이력 + 그 감사 = 한 트랜잭션(행별 커밋과는 독립 — Spring 경계 미러).
  await db.transaction(async (tx) => {
    const [log] = await tx.insert(excelUploadLogs).values({
      uploadedBy: actor.userId,
      // 이력의 부서는 문제 행과 같은 값이어야 한다 — 어긋나면 이력을 믿을 수 없다.
      departmentId: effectiveDepartmentId,
      targetType: "PROBLEM",
      fileName: file.fileName,
      totalRows: outcomes.length,
      successRows,
      failRows: failures.length,
      errorDetail,
    }).returning();
    await recordAudit(tx, {
      actorId: actor.userId, action: "PROBLEM_EXCEL_UPLOADED", targetType: "EXCEL_UPLOAD_LOG",
      targetId: log.id,
      detail: {
        fileName: file.fileName, totalRows: outcomes.length, successRows,
        failRows: failures.length, departmentId: effectiveDepartmentId,
      },
    });
  });

  return { totalRows: outcomes.length, successRows, failRows: failures.length, errorDetail };
}
