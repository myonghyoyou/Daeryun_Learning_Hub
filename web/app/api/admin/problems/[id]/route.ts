import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { archiveProblem, getProblemDetail, updateProblem } from "@/lib/problem/problemService";
import type { ProblemCreateInput } from "@/lib/problem/problemValidation";

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
    const body = await readJson(request);
    await updateProblem(getDb(), parseNumericParam(id, "id")!, body as unknown as ProblemCreateInput, actor);
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
