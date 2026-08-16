import { BizError } from "./errors";
import { ErrorCode } from "./errorCode";

// Spring MethodArgumentTypeMismatchException 핸들러 미러: 잘못된 쿼리/경로 숫자 파라미터는
// 400 + 1000 + "요청 값의 형식이 올바르지 않습니다: <이름>" 으로 나간다(BizError → bizStatus 400).
export function parseNumericParam(value: string | null | undefined, name: string): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "요청 값의 형식이 올바르지 않습니다: " + name);
  }
  return n;
}
