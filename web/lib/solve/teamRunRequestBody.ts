import { MessageNotReadableError } from "../http/errors";
import type { RunMode } from "../db/solveRuns";

/**
 * 팀 바퀴 창구의 JSON 본문 파서.
 *
 * 값이 이상하면 MessageNotReadableError 를 던진다 — 다른 라우트들과 같은 규칙이라
 * handleRoute 가 같은 모양의 응답으로 바꾼다(lib/solve/attemptRequestBody.ts 참고).
 */

const MODES: RunMode[] = ["ALL", "WRONG"];

export function toStartRunBody(raw: Record<string, unknown>): { mode: RunMode } {
  const mode = raw.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as RunMode)) {
    throw new MessageNotReadableError("mode 는 ALL 또는 WRONG 이어야 합니다");
  }
  return { mode: mode as RunMode };
}

export function toAdvanceBody(
  raw: Record<string, unknown>,
): { fromCursor: number; correct: boolean | null } {
  const fromCursor = raw.fromCursor;
  if (typeof fromCursor !== "number" || !Number.isInteger(fromCursor) || fromCursor < 0) {
    throw new MessageNotReadableError("fromCursor 는 0 이상의 정수여야 합니다");
  }
  // 없거나 null 이면 건너뛴 문제로 본다. 참거짓이 아닌 값은 오타이므로 거절한다.
  const correct = raw.correct;
  if (correct === undefined || correct === null) return { fromCursor, correct: null };
  if (typeof correct !== "boolean") {
    throw new MessageNotReadableError("correct 는 참거짓 또는 null 이어야 합니다");
  }
  return { fromCursor, correct };
}
