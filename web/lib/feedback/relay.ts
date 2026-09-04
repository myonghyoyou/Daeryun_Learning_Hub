import "server-only";

/**
 * 비밀을 읽는 유일한 곳. `server-only` 는 클라이언트 컴포넌트가 실수로 이 파일을 import
 * 하면 **빌드를 깨뜨려** 알려 준다 — 사람의 주의력에 기대지 않는다.
 *
 * 5초에서 끊는다. 기본 fetch 는 무한정 기다리는데, 받는 쪽이 느리면 우리 요청 하나가
 * 통째로 물린다.
 */
const TIMEOUT_MS = 5000;

export type RelayResult =
  | { ok: true; taskId: string }
  | { ok: false; reason: "config" | "invalid" | "busy" | "down"; detail: string };

export async function sendFeedback(input: { body: string; from: string }): Promise<RelayResult> {
  const url = process.env.HARRY_INBOUND_URL;
  const secret = process.env.HARRY_INBOUND_SECRET;
  // 설정이 없으면 보내는 척하지 않는다 — 조용히 성공으로 두면 말이 사라진 것을 아무도 모른다.
  if (!url || !secret) return { ok: false, reason: "config", detail: "URL/SECRET 없음" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ body: input.body, from: input.from }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 201) {
      const taskId = String(data.taskId ?? "");
      // taskId 가 없으면 우리 행과 보드 카드를 잇는 끈이 없어진다 — 성공은 성공이니 SENT 로
      // 두되, 진단할 수 있게 남긴다.
      if (!taskId) console.warn("[feedback] 201 인데 taskId 가 없다", data);
      return { ok: true, taskId };
    }
    if (res.status === 400) return { ok: false, reason: "invalid", detail: String(data.error ?? "") };
    if (res.status === 429) return { ok: false, reason: "busy", detail: String(data.error ?? "") };
    // 401 은 "받는 쪽이 죽었다"가 아니라 "우리 비밀이 틀렸다" — config 로 갈라야 관리자가
    // 엉뚱하게 원격 장애로 읽고 다시 보내기를 누르는 일이 없다.
    if (res.status === 401) return { ok: false, reason: "config", detail: String(data.error ?? "") };
    return { ok: false, reason: "down", detail: `${res.status} ${data.error ?? ""}` };
  } catch (e) {
    // 시간초과 · DNS · 네트워크 — 부르는 쪽에서는 전부 "지금 안 된다" 하나다.
    return { ok: false, reason: "down", detail: e instanceof Error ? e.message : "" };
  } finally {
    clearTimeout(timer);
  }
}
