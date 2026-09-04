import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendFeedback } from "./relay";

const OLD = { ...process.env };

beforeEach(() => {
  process.env.HARRY_INBOUND_URL = "https://harry.example/api/inbound/feedback";
  process.env.HARRY_INBOUND_SECRET = "s3cret";
});
afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

function mockFetch(status: number, json: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("sendFeedback", () => {
  it("설정이 없으면 보내는 척하지 않는다", async () => {
    delete process.env.HARRY_INBOUND_SECRET;
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await sendFeedback({ body: "x", from: "a(b)" });
    expect(r).toEqual({ ok: false, reason: "config", detail: expect.any(String) });
    expect(spy).not.toHaveBeenCalled();
  });

  it("201 이면 taskId 를 낸다", async () => {
    mockFetch(201, { ok: true, taskId: "T-1" });
    await expect(sendFeedback({ body: "x", from: "a(b)" })).resolves.toEqual({ ok: true, taskId: "T-1" });
  });

  it("Bearer 비밀과 body·from 을 그대로 싣는다", async () => {
    const spy = mockFetch(201, { taskId: "T-2" });
    await sendFeedback({ body: "본문", from: "직원(u1)" });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://harry.example/api/inbound/feedback");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
    expect(JSON.parse(String(init.body))).toEqual({ body: "본문", from: "직원(u1)" });
  });

  it("400·429·401·그 밖을 서로 다른 이유로 가른다", async () => {
    mockFetch(400, { error: "bad" });
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("invalid");
    vi.restoreAllMocks();
    mockFetch(429, { error: "limit" });
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("busy");
    vi.restoreAllMocks();
    // 401 은 우리 쪽 비밀이 틀렸다는 뜻이다 — "down"(원격 장애)이 아니라 "config"여야
    // 관리자가 다시 보내기를 눌러 봐야 소용없다는 것을 바로 알 수 있다.
    mockFetch(401, { error: "nope" });
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("config");
    vi.restoreAllMocks();
    mockFetch(500, { error: "boom" });
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("down");
  });

  it("네트워크가 죽으면 down 이다", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("down");
  });

  /** 기본 fetch 는 무한정 기다린다 — 남의 장애를 내 장애로 옮기지 않는다. */
  it("AbortSignal 을 함께 보낸다", async () => {
    const spy = mockFetch(201, { taskId: "T-3" });
    await sendFeedback({ body: "x", from: "a" });
    expect((spy.mock.calls[0][1] as RequestInit).signal).toBeDefined();
  });
});
