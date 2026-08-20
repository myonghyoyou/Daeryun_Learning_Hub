import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseDateParam, parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { createProblem } from "@/lib/problem/problemService";
import { toProblemCreateInput } from "@/lib/problem/problemRequestBody";
import { listProblems } from "@/lib/problem/problemListService";

export const runtime = "nodejs";

// ProblemController 는 클래스 레벨 @RequireRole({SUPER_ADMIN, DEPT_ADMIN}) 이다(정답지 R1).
export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    // 본문을 먼저 읽는다. Spring 은 인자 선언 순서대로 해석하므로 @RequestBody 실패가
    // @RequestParam 변환 실패보다 먼저 나간다 — 둘 다 틀린 요청의 문구가 뒤바뀌지 않게 한다.
    const body = toProblemCreateInput(await readJsonStrict(request));
    // departmentId 는 본문이 아니라 쿼리 파라미터다 — ProblemCreateRequest 는 update 와 공유되므로
    // 필드로 넣으면 수정 경로에도 부서 지정 표면이 생긴다(ProblemController.java:37-39).
    const departmentId = parseNumericParam(new URL(request.url).searchParams.get("departmentId"), "departmentId");
    await createProblem(getDb(), body, departmentId, actor);
    return undefined; // ok()
  });
}

/**
 * 목록 조회(ProblemController.java:45-65). 아홉 파라미터를 그대로 받는다(정답지 L1).
 *
 * page·size 의 기본값은 서버가 채운다 — 파라미터 없이 부르던 기존 호출이 첫 페이지를 받는다.
 * 상·하한 클램프(정답지 L2~L4)는 서비스가 한다: 라우트가 먼저 손보면 규칙이 두 곳으로 갈라진다.
 *
 * type·status·tag·keyword 는 `searchParams.get` 이 준 값을 그대로 넘긴다. 없으면 null,
 * `?type=` 이면 빈 문자열인데 이는 Spring 의 `@RequestParam(required=false) String` 과 같다.
 * 날짜만 형식 검증이 필요하다 — `@DateTimeFormat(ISO.DATE)` 미러(정답지 L15).
 */
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const params = new URL(request.url).searchParams;
    return listProblems(getDb(), actor, {
      departmentId: parseNumericParam(params.get("departmentId"), "departmentId"),
      type: params.get("type"),
      status: params.get("status"),
      createdFrom: parseDateParam(params.get("createdFrom"), "createdFrom"),
      createdTo: parseDateParam(params.get("createdTo"), "createdTo"),
      tag: params.get("tag"),
      keyword: params.get("keyword"),
      page: parseNumericParam(params.get("page"), "page") ?? 1,
      size: parseNumericParam(params.get("size"), "size") ?? 20,
    });
  });
}
