import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { findInUseTags } from "@/lib/db/tags";

export const runtime = "nodejs";

// DAO 는 서브플랜 4에서 이미 만들어졌다(정답지 U6) — 여기는 라우트만 추가한다.
// findAllTags(전체, /api/tags 가 씀)와는 다른 쿼리다(U4) — 재사용하면 안 된다.
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    // TagController 에는 @RequireRole 이 없다(U5).
    await requireActor();
    return findInUseTags(getDb());
  });
}
