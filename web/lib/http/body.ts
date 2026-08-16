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
