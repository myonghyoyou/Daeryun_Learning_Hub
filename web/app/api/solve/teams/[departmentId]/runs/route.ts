import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { toStartRunBody } from "@/lib/solve/teamRunRequestBody";
import { startRun } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ departmentId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { departmentId } = await context.params;
    // 경로변수 파싱 → 본문 읽기 → 서비스 순서다. 다른 라우트와 같은 순서를 지킨다.
    const parsed = parseNumericParam(departmentId, "departmentId")!;
    const body = toStartRunBody(await readJsonStrict(request));
    return startRun(getDb(), actor, parsed, body.mode);
  });
}
