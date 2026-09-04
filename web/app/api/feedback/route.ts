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
      problemId: typeof body.problemId === "number" ? body.problemId : undefined,
    });
  });
}
