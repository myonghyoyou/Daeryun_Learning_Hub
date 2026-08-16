import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { getAuthUser, setSessionCookie } from "@/lib/auth/session";
import { changePassword } from "@/lib/auth/authService";

export const runtime = "nodejs";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJson(request);
    const updated = await changePassword(getDb(), await getAuthUser(), (body.newPassword as string) ?? "");
    await setSessionCookie(updated); // JWT 재발급 = 세션 rotate 대응
    return undefined; // ok()
  });
}
