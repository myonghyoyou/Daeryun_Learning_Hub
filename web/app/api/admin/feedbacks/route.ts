import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { findUnsentSummary } from "@/lib/db/feedbacks";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    // 부서 관리자는 볼 수 없다 — 피드백은 부서를 가로지르는 데이터다.
    await requireActor("SUPER_ADMIN");
    return findUnsentSummary(getDb(), 100);
  });
}
