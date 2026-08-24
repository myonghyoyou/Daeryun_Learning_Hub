import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { listProblemStats } from "@/lib/stats/statsService";

export const runtime = "nodejs";

// StatsController 클래스 레벨 @RequireRole({SUPER_ADMIN, DEPT_ADMIN}) 미러(정답지 R1).
// **서브플랜 5의 /api/problems/** 풀이 라우트와 정반대다** — 거긴 역할 제한이 없었다.
// 부서 스코프는 requireActor 가 아니라 listProblemStats 안의 effectiveDepartmentId 가 강제한다(R5).
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const p = new URL(request.url).searchParams;
    return listProblemStats(getDb(), actor, {
      departmentId: parseNumericParam(p.get("departmentId"), "departmentId"),
      status: p.get("status"),
      page: parseNumericParam(p.get("page"), "page") ?? 1,
      size: parseNumericParam(p.get("size"), "size") ?? 20,
    });
  });
}
