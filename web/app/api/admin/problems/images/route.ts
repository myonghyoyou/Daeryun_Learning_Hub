import { requireActor } from "@/lib/auth/currentUser";
import { handleRoute, BizError, bizStatus } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { okMessage } from "@/lib/http/envelope";
import { storeProblemImage } from "@/lib/problem/problemImage";

export const runtime = "nodejs";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json;charset=UTF-8" } });
}

// 승인된 이탈 ⑥(docs/qa/2026-08-16-dept-users-parity-checklist.md:19, plan
// docs/superpowers/plans/2026-08-16-migration-dept-users.md:23). 멀티파트 자체를 파싱할 수 없는
// 경우(폼 파싱 단계 실패)와, 파싱은 됐지만 "file" 파트가 아예 없는 경우 둘 다 이 문구로 통일한다.
//
// Java 는 이 둘을 다르게 다룬다: 멀티파트 파싱 실패는 MultipartException → GlobalExceptionHandler
// 의 전용 핸들러(java:74-77)가 200/1009/"파일을 업로드할 수 없습니다."를 낸다. 반면 file 파트가
// 아예 없으면 `@RequestParam("file") MultipartFile` 바인딩 자체가 MissingServletRequestPartException
// 으로 실패하는데, GlobalExceptionHandler 에는 이 예외 전용 핸들러가 없어 catch-all(java:85-89)로
// 떨어져 200/-1/"처리 중 오류가 발생하였습니다."가 나간다 — 즉 서비스의 `file == null` 가드
// (ProblemImageServiceImpl.java:60-62)는 컨트롤러 바인딩 실패 뒤라 도달 불가능하다.
// 포트는 이 -1 대신 형제 라우트 둘(엑셀 업로드)과 동일하게 1009 로 안내하는 의도적 개선을 그대로
// 적용한다 — Java 의 -1 그대로를 재현하지 않는다.
function fileMissing(): Response {
  return json(okMessage(ErrorCode.FILE_REQUIRED.code, "파일을 업로드할 수 없습니다."));
}

// file 파트는 있지만 0바이트인 경우만 Java 의 `file.isEmpty()` 가드(ProblemImageServiceImpl
// .java:60-62)에 실제로 도달한다 → `BizException(ErrorCode.FILE_REQUIRED)` — 커스텀 메시지가
// 없으므로 ErrorCode 기본 문구("필수 파일이 누락되었습니다.", exception/BizException.java:11-13)가
// 그대로 나간다. `GlobalExceptionHandler.handleBizException`(java:31-38)은 EMPTY_SESSION·
// ACCESS_AUTH_DENIED 가 아닌 모든 BizException 을 400 으로 낸다 — `bizStatus()` 가 그 규칙을
// 그대로 반영하므로 여기서도 재사용한다(200 을 하드코딩하지 않는다).
function emptyFile(): Response {
  return json(okMessage(ErrorCode.FILE_REQUIRED.code, ErrorCode.FILE_REQUIRED.message), bizStatus(ErrorCode.FILE_REQUIRED));
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
  if (form === null) return fileMissing();

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
  if (!(entry instanceof File)) return fileMissing(); // file 파트 부재 — 이탈 ⑥ (역할 통과 후)
  if (entry.size === 0) return emptyFile(); // 0바이트 파일 — Java file.isEmpty() 가드
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
