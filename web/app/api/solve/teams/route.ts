import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { listTeams } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

// 역할 제한이 없다 — 로그인만 하면 전 부서 팀 목록을 본다(직원은 전 부서 문제를 본다).
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    return listTeams(getDb(), actor);
  });
}
