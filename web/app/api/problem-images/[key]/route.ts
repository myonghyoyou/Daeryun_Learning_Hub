import { getStorageClient, PROBLEM_IMAGE_BUCKET } from "@/lib/problem/problemImage";

export const runtime = "nodejs";

// 업로드가 만드는 이름은 <uuid>.<ext> 뿐이다(problemImage.ts 의 storedName).
// 이 형식만 통과시키면 경로 탈출도, 임의 오브젝트 열람도 스토리지 호출 전에 막힌다.
const KEY_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

/**
 * 승인된 이탈 ㉱ — Spring 은 로컬 디스크를 정적 리소스로 서빙했다. 비공개 버킷이라
 * 공개 URL 을 내줄 수 없으므로 서버가 대신 받아 내보낸다.
 *
 * 세션 검사는 여기서 하지 않는다 — `middleware.ts` 의 matcher 가 `/api/:path*` 라
 * 로그인하지 않은 요청은 이 함수에 도달하지 못한다(정답지 E2).
 *
 * 이 라우트만 응답 봉투를 쓰지 않는다. 바이너리를 그대로 내보내야 <img> 가 렌더한다.
 *
 * 미들웨어 봉투 결정(의식적으로 그대로 둔다): 비로그인은 401+JSON, mustChangePassword
 * 사용자는 200+JSON(1012) 을 그대로 받는다 — 둘 다 <img> 입장에서는 깨진 이미지다. 이
 * 경로만 matcher 에서 빼서 라우트가 직접 세션을 보는 대안은 채택하지 않았다: 인증 게이트
 * 자체를 이 Task 가 손대게 되고, 로그인하지 않은 사용자에게 이미지가 안 보이는 것은 애초에
 * 올바른 결과다. mustChangePassword 분기는 서버 로그에 흔적이 남지 않는다는 점에서 비로그인
 * 분기보다 약하지만(비로그인은 401 로 남는다), 두 경우 모두 "비정상 상태에서 이미지가 하나
 * 안 보인다"이지 새로운 취약점이 아니다 — 비밀번호 변경을 강제당한 사용자는 어차피 학습
 * 화면 자체에 접근하지 못하므로 그 화면 안의 이미지가 안 보이는 것도 함께 막힌다.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await context.params;
  if (!KEY_PATTERN.test(key)) return new Response(null, { status: 404 });

  // getStorageClient() 는 SUPABASE_URL/SERVICE_ROLE_KEY 가 없으면 **평범한 Error 를 던진다**
  // (problemImage.ts:34-36). 이 라우트는 handleRoute 를 안 쓰므로 잡아 주는 사람이 없다 —
  // 환경변수가 빠진 배포에서 사이트의 모든 <img> 가 Next 500 HTML 페이지가 된다.
  let data: Blob | null = null;
  try {
    const result = await getStorageClient().storage.from(PROBLEM_IMAGE_BUCKET).download(key);
    if (result.error) return new Response(null, { status: 404 });
    data = result.data;
  } catch (error) {
    // 여기 잡히는 건 getStorageClient() 의 환경변수 누락 throw 뿐만이 아니다 — download() 의
    // 네트워크/SDK 오류도 같은 catch 로 떨어진다. 환경변수만 지목하면 운영자가 엉뚱한 곳을 본다.
    console.error("이미지 프록시: 스토리지 클라이언트 생성 또는 다운로드에 실패했습니다", error);
    return new Response(null, { status: 500 });
  }
  if (!data) return new Response(null, { status: 404 });

  return new Response(data, {
    status: 200,
    headers: {
      "content-type": data.type || "application/octet-stream",
      // 로그인한 사용자에게만 나가는 자원이다. 공유 캐시에 남기지 않는다.
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
    },
  });
}
