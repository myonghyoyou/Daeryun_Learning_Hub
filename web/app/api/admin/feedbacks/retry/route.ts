import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { retryUnsent } from "@/lib/feedback/feedbackService";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return handleRoute(async () => {
    await requireActor("SUPER_ADMIN");
    return retryUnsent(getDb(), 20);
  });
}
