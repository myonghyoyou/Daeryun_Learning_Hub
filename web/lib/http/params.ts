import { BizError } from "./errors";
import { ErrorCode } from "./errorCode";

// Spring MethodArgumentTypeMismatchException 핸들러 미러: 잘못된 쿼리/경로 숫자 파라미터는
// 400 + 1000 + "요청 값의 형식이 올바르지 않습니다: <이름>" 으로 나간다(BizError → bizStatus 400).
export function parseNumericParam(value: string | null | undefined, name: string): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "요청 값의 형식이 올바르지 않습니다: " + name);
  }
  return n;
}

// Spring 의 `@DateTimeFormat(iso = ISO.DATE)` 미러. 애너테이션이 없으면 "2026-08-01" 이
// LocalDate 로 변환되지 않아 MethodArgumentTypeMismatchException 이 나고 목록 조회 전체가
// 실패한다(정답지 L15, QA D1). 오류 형식은 parseNumericParam 과 같아야 하므로 나란히 둔다.
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateParam(value: string | null | undefined, name: string): Date | null {
  if (value == null || value === "") return null;
  const invalid = () => new BizError(ErrorCode.INPUT_VALUE_INVALID, "요청 값의 형식이 올바르지 않습니다: " + name);
  if (!ISO_DATE_PATTERN.test(value)) throw invalid();
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC 는 2026-02-30 을 조용히 3월 2일로 굴린다. LocalDate.parse 는 거부하므로 되짚어 본다.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw invalid();
  }
  return parsed;
}
