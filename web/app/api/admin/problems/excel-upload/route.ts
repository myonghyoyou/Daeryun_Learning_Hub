import { getDb } from "@/lib/db/client";
import { handleRoute, BizError, bizStatus } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { okMessage } from "@/lib/http/envelope";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { uploadProblemsExcel } from "@/lib/problem/problemExcel";

export const runtime = "nodejs";
// 500행 × (문제 insert + 보기/정답 + 태그 + 감사) 를 행별 트랜잭션으로 직렬 처리한다.
export const maxDuration = 300;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 승인된 이탈 ③: Spring 20MB → 플랫폼 안전값 4MB, 1015

function fileRequired(): Response {
  return new Response(JSON.stringify(okMessage(ErrorCode.FILE_REQUIRED.code, "파일을 업로드할 수 없습니다.")),
    { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } });
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
  if (!(entry instanceof File) || entry.size === 0) return fileRequired(); // 정답지 F1(빈 파일 포함)
  const uploaded = entry;
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    if (uploaded.size > MAX_FILE_BYTES) throw new BizError(ErrorCode.FILE_TOO_LARGE);
    // departmentId 는 쿼리 파라미터다(ProblemController.java:117). 부서 관리자가 무엇을 보내든
    // resolveOwningDepartment 가 본인 부서로 강제한다(정답지 R5).
    const departmentId = parseNumericParam(new URL(request.url).searchParams.get("departmentId"), "departmentId");
    return uploadProblemsExcel(getDb(),
      { buffer: await uploaded.arrayBuffer(), fileName: uploaded.name }, departmentId, actor);
  });
}
