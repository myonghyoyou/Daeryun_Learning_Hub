import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { login } from "@/lib/auth/authService";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJson(request);
    const { authUser, response } = await login(getDb(), {
      employeeNo: asStringField(body.employeeNo),
      password: asStringField(body.password),
    });
    await setSessionCookie(authUser);
    return response; // handleRoute 가 ok(response) 로 감싼다
  });
}
