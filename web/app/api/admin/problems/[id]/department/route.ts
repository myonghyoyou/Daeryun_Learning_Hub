import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { changeProblemDepartment } from "@/lib/problem/departmentMove";
import { toDepartmentChangeInput } from "@/lib/problem/problemRequestBody";

export const runtime = "nodejs";

/**
 * 부서 이동(ProblemController.java:99-107).
 *
 * **이 라우트의 역할 집합은 옆 형제들보다 좁다 — 복사해 붙이지 말 것.**
 * `ProblemController` 의 클래스 애너테이션은 `{SUPER_ADMIN, DEPT_ADMIN}` 이지만
 * `RoleCheckInterceptor` 가 메서드 애너테이션을 먼저 보므로 이 엔드포인트만
 * `@RequireRole(UserRole.SUPER_ADMIN)` 으로 좁혀진다(정답지 R2·C1). 이유는 Spring 주석
 * 그대로다: "부서 이동은 문제의 소유권을 옮기는 행위라 부서 관리자에게 열어 주면 자기 부서
 * 문제를 남의 부서로 던져 버릴 수 있다."
 *
 * 아래 `requireActor("SUPER_ADMIN")` 한 줄이 **유일한 그물이다.** 뒤에 아무것도 없다:
 *  - `lib/auth/gate.ts` 의 `evaluateGate` 는 세션 유무와 `mustChangePassword` 만 본다.
 *    역할을 보지 않고, `/api/admin/**` 전체를 막는 백스톱도 없다.
 *  - 서비스의 `changeProblemDepartment` 도 `assertOwnership` 을 부르지 않는다 — Java 가
 *    의도적으로 컨트롤러 애너테이션에만 기대기 때문이다(ProblemServiceImpl.java:503 주석).
 * 여기에 DEPT_ADMIN 을 더하면 부서 관리자가 아무 문제나 아무 부서로 옮길 수 있게 된다.
 *
 * PATCH 가 아니라 PUT 인 것도 Spring 그대로다(CorsConfig 의 allowedMethods 에 PATCH 가 없다).
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await context.params;
    // 캐스팅이 아니라 매핑이다 — 읽을 수 없는 본문은 -1 이 아니라 1000 으로 나간다.
    // 누락·null 은 통과시켜 "옮길 부서를 선택하세요."(정답지 C3)가 나오게 둔다.
    const body = toDepartmentChangeInput(await readJsonStrict(request));
    const sourceNumber = await changeProblemDepartment(
      getDb(), parseNumericParam(id, "id")!, body.departmentId, actor,
    );
    return { sourceNumber }; // 정답지 C10: 응답은 {sourceNumber: n}
  });
}
