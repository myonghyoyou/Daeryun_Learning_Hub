import { getDb } from "@/lib/db/client";
import { handleRoute, BizError } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { okMessage } from "@/lib/http/envelope";
import { requireActor } from "@/lib/auth/currentUser";
import { uploadAccountsExcel } from "@/lib/admin/accountExcel";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 4 * 1024 * 1024; // Q6 승인: 플랫폼 안전값(Spring 20MB 에서 하향, 이탈 기록됨)

export async function POST(request: Request): Promise<Response> {
  // Spring handleMultipartException 미러: 멀티파트 실패/file 부재는 HTTP 200 + 1009.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    file = entry instanceof File ? entry : null;
  } catch {
    file = null;
  }
  if (!file) {
    return new Response(JSON.stringify(okMessage(ErrorCode.FILE_REQUIRED.code, "파일을 업로드할 수 없습니다.")),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } });
  }
  const uploaded = file;
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    if (uploaded.size > MAX_FILE_BYTES) throw new BizError(ErrorCode.FILE_TOO_LARGE);
    return uploadAccountsExcel(getDb(), { buffer: await uploaded.arrayBuffer(), fileName: uploaded.name }, actor.userId);
  });
}
