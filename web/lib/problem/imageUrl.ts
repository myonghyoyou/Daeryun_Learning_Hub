// Spring 출처: ImageUrlValidator.java. 승인된 이탈 ②(정답지) — Task 8(Supabase Storage 이관)이
// 이 접두어를 Spring의 로컬 업로드 경로(`/uploads/images/`)에서 이미지 업로드 API 프록시 경로로
// 바꿨다. 비공개 버킷이라 오브젝트를 직접 공개 URL로 내주지 않는다 — 조회는 서명 URL 또는 이
// 접두어 아래의 프록시 라우트로 붙는다(서브플랜 5 소관, 정답지 I10 근거).
export const IMAGE_URL_PREFIX = "/api/problem-images/";
export const IMAGE_URL_MAX_LENGTH = 500;

export type ImageUrlCheckResult = "VALID" | "BAD_PREFIX" | "TOO_LONG";

/**
 * imageUrl 은 비어 있거나, 이미지 업로드 API가 돌려준 IMAGE_URL_PREFIX 경로여야 한다.
 * 외부 URL(http/https), 프로토콜 상대 URL, 다른 서버 경로는 모두 거부한다. ".." 는 접두어를
 * 통과하고도 상위 경로를 가리킬 수 있으므로 접두어 검사와 함께 막는다(ImageUrlValidator.java:35-48).
 */
export function checkImageUrl(url: string | null | undefined): ImageUrlCheckResult {
  if (url == null) return "VALID";
  const trimmed = url.trim();
  if (trimmed === "") return "VALID";
  if (!trimmed.startsWith(IMAGE_URL_PREFIX) || trimmed.includes("..")) return "BAD_PREFIX";
  if (trimmed.length > IMAGE_URL_MAX_LENGTH) return "TOO_LONG";
  return "VALID";
}
