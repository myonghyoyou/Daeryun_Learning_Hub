import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { listSolveProblems } from "@/lib/solve/solveQueryService";

export const runtime = "nodejs";

// SolveController.list(java:21-25) 미러. 클래스·메서드 어디에도 @RequireRole 이 없다(정답지 E1) —
// 로그인만 확인한다. 부서 스코프도 없다(정답지 S9) — 직원은 전 부서 문제를 본다.
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    // 부서 스코프는 여전히 없다(S9). 직군은 그와 별개로 로그인할 때 고른 화면 필터다.
    return listSolveProblems(getDb(), { keyword: params.get("keyword"), tag: params.get("tag") }, actor.track);
  });
}
