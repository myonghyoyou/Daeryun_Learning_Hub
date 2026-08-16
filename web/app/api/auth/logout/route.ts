import { handleRoute } from "@/lib/http/errors";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return handleRoute(async () => {
    await clearSessionCookie();
    return undefined; // ok() (data 없음) — 현재 logout 응답과 동일
  });
}
