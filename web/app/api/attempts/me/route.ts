import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { findAttemptsByUserId } from "@/lib/db/attempts";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    // AttemptController 에는 @RequireRole 이 없다 — 역할을 넘기지 않으면 인증만 검사한다(정답지 E1).
    const actor = await requireActor();
    // H1: 본인 것만 — actor.userId 로 스코프를 건다.
    return findAttemptsByUserId(getDb(), actor.userId);
  });
}
