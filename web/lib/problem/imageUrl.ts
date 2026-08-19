// Spring 출처: ImageUrlValidator.java. Task 8(Supabase Storage 이관)이 IMAGE_URL_PREFIX 값을
// 바꿀 때까지는 Spring과 동일한 로컬 업로드 접두어를 그대로 쓴다(정답지 V8/I10 근거).
export const IMAGE_URL_PREFIX = "/uploads/images/";
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
