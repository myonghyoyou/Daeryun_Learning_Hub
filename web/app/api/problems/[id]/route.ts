import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { getSolveDetail } from "@/lib/solve/solveQueryService";

export const runtime = "nodejs";

// SolveController.getDetail(java:33-36) 미러. E4: 부서 스코프가 없다 — 남의 부서 문제도 조회된다.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();
    const { id } = await context.params;
    // E5: "요청 값의 형식이 올바르지 않습니다: id". Number(id) 를 쓰면 NaN 이 흘러가
    // "존재하지 않거나 보관된 문제입니다." 라는 **그럴듯한 오답**이 나온다.
    return getSolveDetail(getDb(), parseNumericParam(id, "id")!);
  });
}
