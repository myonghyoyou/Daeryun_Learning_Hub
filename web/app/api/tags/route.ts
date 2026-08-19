import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { findAllTags } from "@/lib/db/tags";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    // TagController 에는 @RequireRole 이 없다 — 역할을 넘기지 않으면 인증만 검사한다.
    await requireActor();
    return findAllTags(getDb());
  });
}
