import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { createProblem } from "@/lib/problem/problemService";
import type { ProblemCreateInput } from "@/lib/problem/problemValidation";

export const runtime = "nodejs";

// ProblemController 는 클래스 레벨 @RequireRole({SUPER_ADMIN, DEPT_ADMIN}) 이다(정답지 R1).
// 목록(GET)은 Task 6 에서 이 파일에 추가된다.
export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const body = await readJson(request);
    // departmentId 는 본문이 아니라 쿼리 파라미터다 — ProblemCreateRequest 는 update 와 공유되므로
    // 필드로 넣으면 수정 경로에도 부서 지정 표면이 생긴다(ProblemController.java:37-39).
    const departmentId = parseNumericParam(new URL(request.url).searchParams.get("departmentId"), "departmentId");
    await createProblem(getDb(), body as unknown as ProblemCreateInput, departmentId, actor);
    return undefined; // ok()
  });
}
