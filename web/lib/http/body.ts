import { MessageNotReadableError } from "./errors";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {}; // 본문 없음/깨짐 → 빈 값 검사가 "사번과 비밀번호를 입력하세요."(1000)를 낸다(파리티)
  }
}

// Jackson 파리티: 스칼라(number/boolean)는 문자열로 강제변환, 객체/배열/null은 미존재 취급.
export function asStringField(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/**
 * 깨진/빈 본문을 Spring 과 같이 취급한다: Jackson 이 파싱에 실패하면
 * HttpMessageNotReadableException 이고 GlobalExceptionHandler(:48-51)가 1000
 * "잘못된 파라미터를 입력했습니다." 를 낸다.
 *
 * `readJson` 과 나눠 두는 이유: 로그인 라우트는 빈 본문을 `{}` 로 받아 "사번과 비밀번호를
 * 입력하세요." 로 안내하는 현재 동작을 유지해야 한다(그 파일의 주석 참고). 문제 라우트처럼
 * 본문을 DTO 로 매핑하는 곳만 이 엄격한 쪽을 쓴다.
 */
export async function readJsonStrict(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new MessageNotReadableError("본문을 JSON 으로 읽을 수 없습니다");
  }
  // 최상위가 객체가 아니면(배열·스칼라·null) Jackson 도 DTO 로 역직렬화하지 못한다.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MessageNotReadableError("본문 최상위가 객체가 아닙니다");
  }
  return parsed as Record<string, unknown>;
}
