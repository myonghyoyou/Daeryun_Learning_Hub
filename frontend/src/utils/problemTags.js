/**
 * 태그 입력(콤마 구분 문자열)을 서버(ProblemServiceImpl.normalizeTags)와 동일한 규칙으로
 * 정규화·검증한다: trim → 빈 값 제거 → 대소문자 무시 중복 제거(소문자로 저장) →
 * 문제당 최대 20개, 태그명 최대 100자. 서버가 소문자로 저장하므로 화면에 보이는 태그와
 * 실제 저장되는 태그가 갈리지 않도록 클라이언트도 동일하게 소문자화한다.
 */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 100;

export function parseTagsInput(text) {
  if (!text) return [];
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function normalizeTags(tags) {
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  return result;
}

export function validateTags(tags) {
  if (tags.length > MAX_TAGS) {
    return `태그는 문제당 최대 ${MAX_TAGS}개까지 등록할 수 있습니다.`;
  }
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return `태그명은 ${MAX_TAG_LENGTH}자 이하여야 합니다.`;
  }
  return null;
}
