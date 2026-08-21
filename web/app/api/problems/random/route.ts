import { getDb } from "@/lib/db/client";
import { handleRoute, BizError } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { randomSolveSet } from "@/lib/solve/solveQueryService";

export const runtime = "nodejs";

// SolveController.randomSet(java:27-31) 미러. E1 처럼 역할 제한이 없다.
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();
    const params = new URL(request.url).searchParams;
    const raw = params.get("count");

    // count 에는 세 갈래가 있고 **문구가 서로 다르다**(정답지 P1·P9·P2·P10, 전부 실측).
    //  ① 파라미터 자체가 없다        → 승인된 이탈 ㉮ (Spring 은 catch-all 로 200/-1 이었다)
    //  ② 값이 빈 문자열이다          → 타입 불일치. ①과 다른 경로다
    //  ③ 값이 정수가 아니다(abc·1.5) → 타입 불일치
    // parseNumericParam 은 빈 문자열을 null(미지정)로 취급하므로 ②를 여기서 갈라 줘야 한다.
    // 안 그러면 count=null 이 그대로 흘러가 LIMIT 이 깨진다.
    if (raw === null) {
      throw new BizError(ErrorCode.INPUT_VALUE_INVALID, ErrorCode.INPUT_VALUE_INVALID.message);
    }
    if (raw === "") {
      throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "요청 값의 형식이 올바르지 않습니다: count");
    }
    // `!` 를 쓰지 않는다. 위 두 분기가 null 을 이미 걸렀지만, Global Constraints 가 못 박은
    // 대로 `!` 는 런타임 가드가 아니다 — 이 파일은 Task 4 가 복사해 갈 파일이다.
    const parsed = parseNumericParam(raw, "count");
    if (parsed === null) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, ErrorCode.INPUT_VALUE_INVALID.message);
    const count = parsed; // ③ 은 여기서 같은 문구로 던진다

    // departmentId 는 비대칭이다 — 선택적 Long 이라 빈 문자열이 그냥 "미지정"이고,
    // 없는 부서 id 는 오류가 아니라 0건이다(정답지 P11, 실측).
    const departmentId = parseNumericParam(params.get("departmentId"), "departmentId");
    return randomSolveSet(getDb(), { count, departmentId });
  });
}
