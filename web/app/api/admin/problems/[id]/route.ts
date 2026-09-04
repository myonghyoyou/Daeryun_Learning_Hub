import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { archiveProblem, getProblemDetail, updateProblem } from "@/lib/problem/problemService";
import { toProblemCreateInput } from "@/lib/problem/problemRequestBody";
import { parseTrack } from "@/lib/problem/track";

export const runtime = "nodejs";

// 세 엔드포인트 모두 클래스 레벨 역할({SUPER_ADMIN, DEPT_ADMIN})을 그대로 쓴다(정답지 R1).
// 부서 스코프는 서비스의 assertOwnership 이 단일 관문으로 막는다(정답지 R6).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const { id } = await context.params;
    return getProblemDetail(getDb(), parseNumericParam(id, "id")!, actor);
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const { id } = await context.params;
    // 캐스팅이 아니라 매핑이다 — 읽을 수 없는 본문은 -1 이 아니라 1000 으로 나간다
    // (등록 라우트의 같은 줄 주석 참고).
    const body = toProblemCreateInput(await readJsonStrict(request));
    // 화면이 track 을 안 보내면 parseTrack 이 ADMIN 으로 읽어 **기술직 문제가 조용히
    // 행정직으로 바뀐다.** 수정 화면은 불러온 문제의 현재 직군을 반드시 실어 보내야 한다.
    const track = parseTrack(new URL(request.url).searchParams.get("track"));
    await updateProblem(getDb(), parseNumericParam(id, "id")!, body, track, actor);
    return undefined; // ok()
  });
}

// Spring 은 DELETE /{id} 로 보관(ARCHIVED) 처리한다 — 행을 지우지 않는다(ProblemController.java:77-80).
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const { id } = await context.params;
    await archiveProblem(getDb(), parseNumericParam(id, "id")!, actor);
    return undefined; // ok()
  });
}
