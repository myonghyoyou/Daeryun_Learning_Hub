import { ZodError } from "zod";
import { ErrorCode, type ErrorCodeEntry } from "./errorCode";
import { ok, okMessage } from "./envelope";

export class BizError extends Error {
  constructor(public readonly errorCode: ErrorCodeEntry, message?: string) {
    super(message ?? errorCode.message);
  }
}

/**
 * 요청 본문을 요청 DTO 모양으로 읽을 수 없을 때. Spring 은 Jackson 이 역직렬화에 실패하면
 * HttpMessageNotReadableException 을 던지고, GlobalExceptionHandler(:48-51) 가 이를
 * INPUT_VALUE_INVALID(1000) 로 바꾼다 — 알 수 없는 enum 값, 숫자 자리의 "abc", 배열 자리의
 * 문자열이 전부 여기로 온다.
 *
 * BizError 와 분리하는 이유는 상태 코드다. BizError 는 400 으로 나가지만 이 핸들러는
 * ErrorResponse 를 그대로 반환해 HTTP 200 이다(handleValidationException 과 같은 경로).
 * `message` 는 로그용이며 응답에는 나가지 않는다 — 사용자에게는 항상 ErrorCode 의 고정 문구다.
 */
export class MessageNotReadableError extends Error {}

// 현재 GlobalExceptionHandler.handleBizException 미러.
export function bizStatus(entry: ErrorCodeEntry): 401 | 403 | 400 {
  if (entry.code === ErrorCode.EMPTY_SESSION.code) return 401;
  if (entry.code === ErrorCode.ACCESS_AUTH_DENIED.code) return 403;
  return 400;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=UTF-8" },
  });
}

/**
 * 라우트 핸들러를 감싸 예외를 현재 계약대로 봉투+상태로 바꾼다.
 * - 성공: 200 + ok(data)
 * - BizError: bizStatus + okMessage(code, message)
 * - MessageNotReadableError: HTTP 200 + { resultCode:1000 } (현재 handleMessageNotReadableException 미러)
 * - ZodError(필드검증): HTTP 200 + { resultCode:1000, errorList } (현재 handleValidationException 미러)
 * - 기타: HTTP 200 + MSG_PROC_FAIL (현재 handleUnexpectedException 미러)
 */
export async function handleRoute(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return json(ok(data), 200);
  } catch (error) {
    if (error instanceof BizError) {
      return json(okMessage(error.errorCode.code, error.message), bizStatus(error.errorCode));
    }
    if (error instanceof MessageNotReadableError) {
      // ErrorResponse 는 @JsonInclude(NON_NULL) 이고 data(=errorList) 가 null 이므로
      // 필드 자체가 빠진다 — ZodError 분기가 errorList 를 싣는 것과 다르다.
      console.warn("요청 본문을 읽을 수 없습니다.", error.message);
      return json({ resultCode: ErrorCode.INPUT_VALUE_INVALID.code, resultMsg: ErrorCode.INPUT_VALUE_INVALID.message }, 200);
    }
    if (error instanceof ZodError) {
      // 파리티 미세 갭: 현재 Java FieldError.value 는 거부된 입력값을 담지만, Zod 이슈는 값을
      // 직접 주지 않아 null 로 둔다. 프론트는 field/reason 과 resultCode 로 분기하므로 화면엔 영향이 없다.
      const errorList = error.errors.map((e) => ({
        field: e.path.join("."),
        value: null,
        reason: e.message,
      }));
      return json({ resultCode: ErrorCode.INPUT_VALUE_INVALID.code, resultMsg: ErrorCode.INPUT_VALUE_INVALID.message, errorList }, 200);
    }
    console.error("처리되지 않은 예외가 발생했습니다.", error);
    return json(okMessage(ErrorCode.MSG_PROC_FAIL.code, ErrorCode.MSG_PROC_FAIL.message), 200);
  }
}
