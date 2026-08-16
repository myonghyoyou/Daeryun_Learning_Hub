import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { getAuthUser } from "@/lib/auth/session";
import { sessionStatus } from "@/lib/auth/authService";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => sessionStatus(getDb(), await getAuthUser()));
}
