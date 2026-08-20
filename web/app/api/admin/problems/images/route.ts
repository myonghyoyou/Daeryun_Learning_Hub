import { requireActor } from "@/lib/auth/currentUser";
import { handleRoute, BizError, bizStatus } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { okMessage } from "@/lib/http/envelope";
import { storeProblemImage } from "@/lib/problem/problemImage";

export const runtime = "nodejs";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } });
}

// GlobalExceptionHandler.handleMultipartException(java:74-77): 멀티파트 자체를 파싱할 수 없을 때
// (인터셉터보다 앞) 고정 문구. BizException(ErrorCode.FILE_REQUIRED)의 기본 문구(아래 fileMissing)와
// 다르다 — 같은 resultCode 1009 에 두 가지 문구가 존재하는 것이 Java 의 실제 계약이다.
function multipartUnreadable(): Response {
  return json(okMessage(ErrorCode.FILE_REQUIRED.code, "파일을 업로드할 수 없습니다."));
}

// ProblemImageServiceImpl.store(java:60-62): `file == null || file.isEmpty()` → 커스텀 메시지 없이
// BizException(ErrorCode.FILE_REQUIRED) → ErrorCode 기본 문구("필수 파일이 누락되었습니다.")가 그대로 나간다.
function fileMissing(): Response {
  return json(okMessage(ErrorCode.FILE_REQUIRED.code, ErrorCode.FILE_REQUIRED.message));
}

/**
 * `POST /api/admin/problems/images`(ProblemController.uploadImage, java:84-88).
 *
 * 역할은 **{SUPER_ADMIN, DEPT_ADMIN}** 이다(정답지 R1). `uploadImage` 에는 메서드 레벨
 * `@RequireRole` 이 없어 클래스 레벨(`ProblemController.java:23`) 두 역할을 그대로 물려받는다 —
 * `SUPER_ADMIN` 전용으로 좁힌 엔드포인트는 부서 이동(`changeDepartment`) 하나뿐이다(R2).
 * 멀티파트 처리 형태는 `excel-upload/route.ts` 를 따른다(파싱 실패 → 200/1009, 역할 검사가
 * 파일 인자 리졸브보다 먼저).
 */
export async function POST(request: Request): Promise<Response> {
  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    form = null;
  }
  if (form === null) return multipartUnreadable();

  // Spring RoleCheckInterceptor 순서 미러: 인자(file) 리졸브 전에 역할 검사.
  try {
    await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
  } catch (error) {
    if (error instanceof BizError) {
      return new Response(JSON.stringify(okMessage(error.errorCode.code, error.message)),
        { status: bizStatus(error.errorCode), headers: { "content-type": "application/json;charset=UTF-8" } });
    }
    throw error;
  }

  const entry = form.get("file");
  if (!(entry instanceof File) || entry.size === 0) return fileMissing();
  const uploaded = entry;

  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const imageUrl = await storeProblemImage({
      buffer: await uploaded.arrayBuffer(),
      fileName: uploaded.name,
      contentType: uploaded.type,
      size: uploaded.size,
    }, actor);
    // ImageUploadResponse.java: { imageUrl }.
    return { imageUrl };
  });
}
