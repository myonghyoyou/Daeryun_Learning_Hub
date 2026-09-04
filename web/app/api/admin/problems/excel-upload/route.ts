import { getDb } from "@/lib/db/client";
import { handleRoute, BizError, bizStatus } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { okMessage } from "@/lib/http/envelope";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { uploadProblemsExcel } from "@/lib/problem/problemExcel";
import { parseTrack } from "@/lib/problem/track";

export const runtime = "nodejs";
// 500행 × (문제 insert + 보기/정답 + 태그 + 감사) 를 행별 트랜잭션으로 직렬 처리한다.
export const maxDuration = 300;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 승인된 이탈 ③: Spring 20MB → 플랫폼 안전값 4MB, 1015

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json;charset=UTF-8" } });
}

// 승인된 이탈 ⑥(docs/qa/2026-08-16-dept-users-parity-checklist.md:19, plan
// docs/superpowers/plans/2026-08-16-migration-dept-users.md:23). 멀티파트 자체를 파싱할 수 없는
// 경우와, 파싱은 됐지만 "file" 파트가 아예 없는 경우 둘 다 이 문구로 통일한다 — Java 는 후자를
// MissingServletRequestPartException 으로 처리하는데 GlobalExceptionHandler 에 전용 핸들러가 없어
// catch-all(200/-1/"처리 중 오류가 발생하였습니다.")로 떨어진다. 포트는 -1 대신 1009 로 안내하는
// 의도적 개선을 그대로 적용한다(images/route.ts 와 동일 근거).
function fileRequired(): Response {
  return json(okMessage(ErrorCode.FILE_REQUIRED.code, "파일을 업로드할 수 없습니다."));
}

// file 파트는 있지만 0바이트인 경우만 Java 의 `file.isEmpty()` 가드
// (ExcelProblemUploadServiceImpl.java:97-99)에 실제로 도달한다 → `BizException(ErrorCode.FILE_REQUIRED)`
// — 커스텀 메시지가 없으므로 ErrorCode 기본 문구("필수 파일이 누락되었습니다.")가 그대로 나간다.
// GlobalExceptionHandler.handleBizException 은 EMPTY_SESSION·ACCESS_AUTH_DENIED 가 아닌 모든
// BizException 을 400 으로 낸다 — bizStatus() 를 재사용해 200 을 하드코딩하지 않는다.
function emptyFile(): Response {
  return json(okMessage(ErrorCode.FILE_REQUIRED.code, ErrorCode.FILE_REQUIRED.message), bizStatus(ErrorCode.FILE_REQUIRED));
}

/**
 * `POST /api/admin/problems/excel-upload`(ProblemController.uploadExcel).
 *
 * 역할은 **{SUPER_ADMIN, DEPT_ADMIN}** 이다(정답지 R1). `uploadExcel` 에는 메서드 레벨
 * `@RequireRole` 이 없어 클래스 레벨 두 역할을 그대로 물려받는다 — `SUPER_ADMIN` 전용으로 좁힌
 * 엔드포인트는 부서 이동 하나뿐이다(R2). 계정 엑셀 업로드 라우트를 구조만 따라 오면서 역할까지
 * 베끼면(그쪽은 UserAdminController 가 총괄 전용) 부서 관리자가 일괄 등록에서 통째로 막힌다.
 */
export async function POST(request: Request): Promise<Response> {
  // Spring checkMultipart 미러: 멀티파트 파싱 실패는 인터셉터보다 앞이라 HTTP 200 + 1009.
  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    form = null;
  }
  if (form === null) return fileRequired();
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
  if (!(entry instanceof File)) return fileRequired(); // file 파트 부재 — 이탈 ⑥ (F1a)
  if (entry.size === 0) return emptyFile(); // 0바이트 파일 — Java file.isEmpty() 가드 (F1b)
  const uploaded = entry;
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    if (uploaded.size > MAX_FILE_BYTES) throw new BizError(ErrorCode.FILE_TOO_LARGE);
    // departmentId 는 쿼리 파라미터다(ProblemController.java:117). 부서 관리자가 무엇을 보내든
    // resolveOwningDepartment 가 본인 부서로 강제한다(정답지 R5).
    const departmentId = parseNumericParam(new URL(request.url).searchParams.get("departmentId"), "departmentId");
    // 직군도 부서와 같이 쿼리 파라미터다. 한 파일은 한 직군이므로 엑셀 열로 받지 않는다.
    const track = parseTrack(new URL(request.url).searchParams.get("track"));
    return uploadProblemsExcel(getDb(),
      { buffer: await uploaded.arrayBuffer(), fileName: uploaded.name }, departmentId, track, actor);
  });
}
