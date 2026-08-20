import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getDb } from "../db/client";
import { recordAudit } from "../audit/auditLog";
import { ErrorCode } from "../http/errorCode";
import { BizError } from "../http/errors";
import { IMAGE_URL_PREFIX } from "./imageUrl";
import type { AuthUser } from "../auth/types";

// Spring 출처: ProblemImageServiceImpl.java. 승인된 이탈 ①(정답지) — Vercel 서버리스에는 영속
// 디스크가 없어 로컬 uploadDir 저장을 이식할 수 없다. Supabase Storage 의 비공개 버킷으로 간다.
const BUCKET = "problem-images";

// ProblemImageServiceImpl.java:33-34. svg 는 인라인 <script> 를 담을 수 있어 저장형 XSS 가 된다
// (I1) — 의도적으로 허용목록에서 뺀다.
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
// ProblemImageServiceImpl.java:36-37 (I2).
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
// ProblemImageServiceImpl.java:45 (I4).
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
// ProblemImageServiceImpl.java:133-134,138-139 (I5) — Content-Type 이든 확장자든 허용목록을
// 벗어나면 같은 문구를 쓴다(어느 쪽이 어긋났는지는 사용자에게 노출하지 않는다).
const FILE_TYPE_MESSAGE = "허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.";

let supabase: ReturnType<typeof createClient> | undefined;

function getStorageClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    // 서비스 롤 키. 서버 전용 — NEXT_PUBLIC_ 접두어를 붙이면 브라우저 번들에 들어가 누구나
    // 스토리지 전체를 조작할 수 있다(체크리스트 환경변수 절 참고).
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.");
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

/**
 * 클라이언트가 보낸 원본 파일명에서 안전한 확장자만 뽑아낸다(경로 구분자 제거 후 마지막
 * 세그먼트의 마지막 점 뒤, [a-z0-9]{1,5} 만 허용). ProblemImageServiceImpl.extractSafeExtension
 * (java:152-167) 미러 — "a.png/../../../etc/cron.d/evil" 같은 이름도 확장자만 안전하게 뽑는다.
 * 원본 파일명 자체는 저장 경로 생성에 절대 쓰이지 않는다(아래 store 참고, I6).
 */
function extractSafeExtension(originalFilename: string): string {
  const normalized = originalFilename.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const baseName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const lastDot = baseName.lastIndexOf(".");
  if (lastDot < 0 || lastDot === baseName.length - 1) return "";
  const extension = baseName.slice(lastDot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(extension) ? extension : "";
}

/**
 * Content-Type 과 확장자를 검증하고 (소문자) 확장자를 반환한다. ProblemImageServiceImpl
 * .validateAndExtractExtension(java:130-142) 미러 — Content-Type 을 먼저 본다(클라이언트가
 * 보낸 값이라 신뢰하지 않고, 파일명 확장자와 함께 독립적으로 허용목록을 통과해야 한다, I3).
 */
function validateAndExtractExtension(contentType: string, fileName: string): string {
  if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    throw new BizError(ErrorCode.FILE_TYPE_NOT_ALLOWED, FILE_TYPE_MESSAGE);
  }
  const extension = extractSafeExtension(fileName);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BizError(ErrorCode.FILE_TYPE_NOT_ALLOWED, FILE_TYPE_MESSAGE);
  }
  return extension;
}

export interface ProblemImageFile {
  buffer: ArrayBuffer;
  fileName: string;
  contentType: string;
  size: number;
}

/**
 * 문제 이미지를 Supabase Storage 비공개 버킷에 저장하고, 학습 화면이 그대로 저장할 수 있는
 * IMAGE_URL_PREFIX 경로를 돌려준다. Spring 출처: ProblemImageServiceImpl.store(java:58-110).
 * 이 함수는 업로드와 URL 형식만 확정한다 — 비공개 버킷 조회(서명 URL/프록시)는 서브플랜 5 소관이다.
 */
export async function storeProblemImage(file: ProblemImageFile, actor: AuthUser): Promise<string> {
  // java:63-65 (I4) — Content-Type/확장자 검사보다 먼저.
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new BizError(ErrorCode.FILE_TOO_LARGE, "이미지 크기는 5MB를 초과할 수 없습니다.");
  }
  const extension = validateAndExtractExtension(file.contentType, file.fileName);

  // 항상 새 UUID + 검증된 확장자. 원본 파일명은 절대 쓰지 않으므로 경로 조작이 불가능하다(I6).
  // Supabase Storage 오브젝트 키는 파일시스템 경로가 아니라서 Java 의 "target.getParent()"
  // 벨트-앤-브레이스 검사(I7)는 대응 개념이 없다 — 애초에 UUID 파일명만 쓰므로 "..''"가 키에
  // 섞일 방법이 없다.
  const storedName = `${randomUUID()}.${extension}`;

  const client = getStorageClient();
  const { error: uploadError } = await client.storage.from(BUCKET).upload(storedName, file.buffer, {
    contentType: file.contentType,
    upsert: false,
  });
  if (uploadError) {
    throw new BizError(ErrorCode.MSG_PROC_FAIL, "이미지 업로드에 실패했습니다.");
  }

  // fail-closed(I8): 감사 로그가 실패하면 이미 저장된 파일을 지우고 업로드 전체를 실패시킨다
  // (java:96-107) — 감사 없이 파일만 남는 상태를 금지한다.
  try {
    await recordAudit(getDb(), {
      actorId: actor.userId,
      action: "PROBLEM_IMAGE_UPLOADED",
      targetType: "PROBLEM_IMAGE",
      targetId: null,
      detail: { fileName: storedName },
    });
  } catch {
    await client.storage.from(BUCKET).remove([storedName]).catch(() => {});
    throw new BizError(ErrorCode.MSG_PROC_FAIL, "이미지 업로드에 실패했습니다.");
  }

  return `${IMAGE_URL_PREFIX}${storedName}`;
}
