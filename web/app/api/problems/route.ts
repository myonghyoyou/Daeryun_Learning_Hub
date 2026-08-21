import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { listSolveProblems } from "@/lib/solve/solveQueryService";

export const runtime = "nodejs";

// SolveController.list(java:21-25) 미러. 클래스·메서드 어디에도 @RequireRole 이 없다(정답지 E1) —
// 로그인만 확인한다. 부서 스코프도 없다(정답지 S9) — 직원은 전 부서 문제를 본다.
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();
    const params = new URL(request.url).searchParams;
    return listSolveProblems(getDb(), { keyword: params.get("keyword"), tag: params.get("tag") });
  });
}
