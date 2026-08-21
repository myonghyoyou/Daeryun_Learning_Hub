import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { toAttemptSubmitBody } from "@/lib/solve/attemptRequestBody";
import { submitAttempt } from "@/lib/solve/attemptService";

export const runtime = "nodejs";

/**
 * `AttemptController.submit`(java) 미러. E1: `@RequireRole` 이 없다 — 로그인만 하면 누구나 통과한다.
 *
 * **메시지 순서가 계약이다(E5-1, 실측).** Spring 은 `@PathVariable`(0번 인자) → `@RequestBody`
 * (1번) → 서비스 순으로 처리한다:
 *   - 잘못된 id + 깨진 본문        → 400 / "요청 값의 형식이 올바르지 않습니다: id"
 *   - 없는 문제 + 깨진 본문        → 200 / 1000 / "잘못된 파라미터를 입력했습니다." (본문이 조회보다 먼저다)
 *   - 없는 문제 + 정상 본문        → 400 / "존재하지 않거나 보관된 문제입니다."
 *   - 잘못된 id + 정상 본문        → 400 / "요청 값의 형식이 올바르지 않습니다: id"
 * 그래서 순서는 반드시 **경로변수 파싱 → readJsonStrict → submitAttempt** 다. 본문 읽기를
 * submitAttempt 안으로 넣거나 문제 조회 뒤로 미루면 두 번째 줄이 뒤집힌다.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { id } = await context.params;
    const problemId = parseNumericParam(id, "id")!; // E5: 파라미터 이름이 문구에 붙는다
    // readJsonStrict — readJson 이 아니다. readJson 은 깨진 본문을 {} 로 삼키는데(로그인
    // 라우트 전용 특례), 이 라우트처럼 본문을 DTO 로 매핑하는 곳은 엄격한 쪽을 써야
    // MessageNotReadableError → 200/1000/errorList 없음(E6)이 나온다.
    const body = toAttemptSubmitBody(await readJsonStrict(request));
    return submitAttempt(getDb(), problemId, body, actor);
  });
}
