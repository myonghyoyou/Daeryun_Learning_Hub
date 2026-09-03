import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { finishRun } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

// 본문이 없다 — 끝내는 데 더 필요한 값이 없다.
export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { runId } = await context.params;
    return finishRun(getDb(), actor, parseNumericParam(runId, "runId")!);
  });
}
