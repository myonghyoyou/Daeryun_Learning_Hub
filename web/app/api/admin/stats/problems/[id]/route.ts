import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { getProblemStatDetail } from "@/lib/stats/statsService";

export const runtime = "nodejs";

// 클래스 레벨 역할 규칙을 그대로 받는다(정답지 R1·R2) — 메서드 레벨 재정의는 없다.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const { id } = await context.params;
    return getProblemStatDetail(getDb(), parseNumericParam(id, "id")!, actor);
  });
}
