import { getDb } from "@/lib/db/client";
import { handleRoute, BizError, bizStatus } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { okMessage } from "@/lib/http/envelope";
import { requireActor } from "@/lib/auth/currentUser";
import { uploadAccountsExcel } from "@/lib/admin/accountExcel";

export const runtime = "nodejs";
// 500행 × bcrypt(10) 직렬 해싱은 수 분이 걸릴 수 있다 — 타임아웃되면 행은 커밋됐는데
// 임시비밀번호 응답만 유실된다(D6로 메일이 없어 복구 불가). 상한/비동기화 재검토는 컷오버 결정.
export const maxDuration = 300;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // Q6 승인: 플랫폼 안전값(Spring 20MB 에서 하향, 이탈 기록됨)

function fileRequired(): Response {
  return new Response(JSON.stringify(okMessage(ErrorCode.FILE_REQUIRED.code, "파일을 업로드할 수 없습니다.")),
    { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } });
}

export async function POST(request: Request): Promise<Response> {
  // Spring checkMultipart 미러: 멀티파트 파싱 실패는 인터셉터보다 앞이라 HTTP 200 + 1009(파리티 유지).
  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    form = null;
  }
  if (form === null) return fileRequired();
  // Spring RoleCheckInterceptor 순서 미러: 인자(file) 리졸브 전에 역할 검사.
  try {
    await requireActor("SUPER_ADMIN");
  } catch (error) {
    if (error instanceof BizError) {
      return new Response(JSON.stringify(okMessage(error.errorCode.code, error.message)),
        { status: bizStatus(error.errorCode), headers: { "content-type": "application/json;charset=UTF-8" } });
    }
    throw error;
  }
  const entry = form.get("file");
  if (!(entry instanceof File)) return fileRequired(); // file 부재 — 이탈 ⑥ (역할 통과 후)
  const uploaded = entry;
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN"); // 이미 통과 — actor.userId 재사용 위해 유지(중복 호출 무해)
    if (uploaded.size > MAX_FILE_BYTES) throw new BizError(ErrorCode.FILE_TOO_LARGE);
    return uploadAccountsExcel(getDb(), { buffer: await uploaded.arrayBuffer(), fileName: uploaded.name }, actor.userId);
  });
}
