import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { getAuthUser, setSessionCookie } from "@/lib/auth/session";
import { changePassword } from "@/lib/auth/authService";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJson(request);
    const updated = await changePassword(getDb(), await getAuthUser(), asStringField(body.newPassword) ?? "");
    await setSessionCookie(updated); // JWT 재발급 = 세션 rotate 대응
    return undefined; // ok()
  });
}
