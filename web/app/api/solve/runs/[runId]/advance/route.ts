import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { toAdvanceBody } from "@/lib/solve/teamRunRequestBody";
import { advanceRun } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { runId } = await context.params;
    const parsed = parseNumericParam(runId, "runId")!;
    const body = toAdvanceBody(await readJsonStrict(request));
    return advanceRun(getDb(), actor, parsed, body.fromCursor, body.correct);
  });
}
