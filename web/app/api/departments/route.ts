import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { findDepartmentsWithProblems } from "@/lib/db/departments";

export const runtime = "nodejs";

/**
 * 로그인한 사용자라면 누구나 부서 선택지를 조회할 수 있다 — 랜덤 풀이에서 부서를 고르려면
 * 직원도 목록이 필요한데, 관리자용 `/api/admin/departments` 는 SUPER_ADMIN 전용이다.
 * `DepartmentOptionController` 미러이며 `@RequireRole` 이 없다.
 *
 * **이 라우트는 서브플랜 5가 빠뜨린 것이다.** 설계 배정표는 이걸 서브플랜 5에 배정했는데
 * 그 정답지가 SolveController 를 읽어 범위를 잡으면서 놓쳤다. 프론트
 * (`RandomSetupPage.jsx:34`)가 이미 호출하고 있어 부서 드롭다운이 실패하던 상태였다.
 */
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();   // 역할 제한 없음 — 로그인만 확인한다
    // 전 부서를 주면 행정직으로 들어온 사람의 랜덤 드롭다운에 `기술직` 이 뜨고, 고르면
    // 문제 질의는 걸러지므로 0문제가 나와 화면이 고장난 것처럼 보인다.
    return findDepartmentsWithProblems(getDb(), actor.track);
  });
}
