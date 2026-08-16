import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { login } from "@/lib/auth/authService";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {}; // 본문 없음/깨짐 → 빈 값 검사가 "사번과 비밀번호를 입력하세요."(1000)를 낸다(파리티)
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJson(request);
    const { authUser, response } = await login(getDb(), {
      employeeNo: body.employeeNo as string | undefined,
      password: body.password as string | undefined,
    });
    await setSessionCookie(authUser);
    return response; // handleRoute 가 ok(response) 로 감싼다
  });
}
