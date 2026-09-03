import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { getHallOfFame } from "@/lib/solve/hallOfFameService";

export const runtime = "nodejs";

// 역할 제한이 없다 — 로그인만 하면 본다. 순위에는 관리자도 함께 들어간다.
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    return getHallOfFame(getDb(), actor);
  });
}
