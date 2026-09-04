import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { login } from "@/lib/auth/authService";
import { setSessionCookie } from "@/lib/auth/session";
import { parseTrack } from "@/lib/problem/track";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJson(request);
    const { authUser, response } = await login(getDb(), {
      employeeNo: asStringField(body.employeeNo),
      password: asStringField(body.password),
    });
    // 직군은 자격증명이 아니다 — 로그인 화면 토글에서 온 값을 여기서 세션에 얹는다.
    await setSessionCookie({ ...authUser, track: parseTrack(body.track) });
    return response; // handleRoute 가 ok(response) 로 감싼다
  });
}
