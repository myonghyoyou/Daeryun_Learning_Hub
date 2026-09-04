import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

/** 계약 상한은 2000자지만, 우리가 붙이는 머리말이 예산을 먹으므로 입력은 1000자로 막는다. */
export const FEEDBACK_MAX_INPUT = 1000;
export const FEEDBACK_MAX_BODY = 2000;
export const FROM_MAX = 40;
const PATH_MAX = 200;

export function validateFeedbackInput(input: { body: unknown; sourcePath?: unknown }): {
  body: string;
  sourcePath: string | null;
} {
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (body === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "내용을 적어주세요.");
  if (body.length > FEEDBACK_MAX_INPUT) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `${FEEDBACK_MAX_INPUT}자까지 쓸 수 있습니다.`);
  }
  // 우리 화면 경로만 받는다 — 외부 URL 이 섞이면 보드에 남의 주소가 실린다.
  const raw = typeof input.sourcePath === "string" ? input.sourcePath : "";
  const sourcePath = raw.startsWith("/") ? raw.slice(0, PATH_MAX) : null;
  return { body, sourcePath };
}
