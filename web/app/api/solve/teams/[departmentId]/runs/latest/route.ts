import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { getLatestRunView } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

// 바퀴가 하나도 없으면 data 가 null 이다 — 오류가 아니다. 화면이 팀 목록으로 돌려보낸다.
export async function GET(
  _request: Request,
  context: { params: Promise<{ departmentId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { departmentId } = await context.params;
    return getLatestRunView(getDb(), actor, parseNumericParam(departmentId, "departmentId")!);
  });
}
