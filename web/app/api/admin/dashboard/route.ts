import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { getDashboardSummary } from "@/lib/stats/dashboardService";

export const runtime = "nodejs";

// DashboardController 클래스 레벨 @RequireRole({SUPER_ADMIN, DEPT_ADMIN}) 미러(정답지 R1·R2 —
// 메서드 레벨 재정의는 없다). 부서 스코프는 requireActor 가 아니라 getDashboardSummary 안의
// effectiveDepartmentId 가 강제한다(R5·R6).
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const p = new URL(request.url).searchParams;
    return getDashboardSummary(getDb(), actor, parseNumericParam(p.get("departmentId"), "departmentId"));
  });
}
