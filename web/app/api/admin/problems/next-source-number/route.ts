import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { nextSourceNumber } from "@/lib/problem/departmentMove";

export const runtime = "nodejs";

/**
 * 등록 폼의 번호 칸을 미리 채우는 조회(ProblemController.java:109-112).
 *
 * 역할은 클래스 레벨 그대로 `{SUPER_ADMIN, DEPT_ADMIN}` 이다(정답지 R1) — 옆 디렉터리의
 * 부서 이동만 메서드 레벨로 좁혀지고 이 엔드포인트는 좁히지 않는다. 부서 관리자가 자기
 * 부서의 다음 번호를 보는 것은 정상 동작이며, 요청한 `departmentId` 는 서비스의
 * `resolveOwningDepartment` 가 무시하고 본인 부서로 강제한다(정답지 R5·C11).
 *
 * **경로 주의:** 이 정적 세그먼트는 형제인 `[id]` 와 같은 자리에 있다. Next.js 는 정적
 * 세그먼트를 동적 세그먼트보다 먼저 매칭하므로 `/api/admin/problems/next-source-number` 는
 * 여기로 온다. 만약 `[id]` 가 먼저 잡히면 응답은 숫자가 아니라 "존재하지 않는 문제입니다."
 * 가 되므로, route.test.ts 의 첫 단언(data 가 숫자)이 그 회귀를 잡는다.
 */
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const departmentId = parseNumericParam(new URL(request.url).searchParams.get("departmentId"), "departmentId");
    // 정답지 C12: 응답 data 는 숫자 그대로다 — 객체로 감싸면 화면의 번호 칸이 비어 버린다.
    return nextSourceNumber(getDb(), departmentId, actor);
  });
}
