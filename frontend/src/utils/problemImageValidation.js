/**
 * 문제 이미지 첨부의 클라이언트 측 검증. 서버(ProblemImageServiceImpl)는 확장자와
 * Content-Type을 각각 독립적으로 허용 목록과 대조하고, 5MB를 초과하는 파일을 거부한다.
 * 여기서 동일한 한도를 미리 검사해 사용자가 업로드 실패를 서버 응답으로만 알게 되는 일을
 * 줄인다 — 다만 이 검사는 서버 재검증을 대체하지 않는다(클라이언트 값은 위조 가능).
 */
export const ALLOWED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
export const ALLOWED_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const TYPE_ERROR = "허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.";

function extractExtension(fileName) {
  if (!fileName) return "";
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0 || lastDot === fileName.length - 1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function validateImageFile(file) {
  if (!file) {
    return "이미지 파일을 선택하세요.";
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "이미지 크기는 5MB를 초과할 수 없습니다.";
  }
  const contentType = (file.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_CONTENT_TYPES.includes(contentType)) {
    return TYPE_ERROR;
  }
  const extension = extractExtension(file.name);
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(extension)) {
    return TYPE_ERROR;
  }
  return null;
}
