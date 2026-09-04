import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { submitFeedback } from "@/lib/feedback/feedbackService";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    // 역할을 넘기지 않는다 — 로그인한 누구나 보낼 수 있다.
    const actor = await requireActor();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return submitFeedback(getDb(), actor, {
      body: body.body,
      sourcePath: body.sourcePath,
      // `1.5`·`Infinity`·`1e30` 같은 값을 그대로 보내면 저장 전에 DB(bigint)가 예외를
      // 던져 사용자 원문이 아예 저장되지 않는다 — 정수·양수만 통과시킨다.
      problemId:
        typeof body.problemId === "number" && Number.isInteger(body.problemId) && body.problemId > 0
          ? body.problemId
          : undefined,
    });
  });
}
