import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { getRunView } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { runId } = await context.params;
    return getRunView(getDb(), actor, parseNumericParam(runId, "runId")!);
  });
}
