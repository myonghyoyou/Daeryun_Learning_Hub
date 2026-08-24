// Supabase 환경변수를 세운다. .env 를 통째로 로드하면 DATABASE_URL 이 함께 실려
// 스위트가 개발 DB 를 truncate 한다(test/env.ts 주석 참고).
import "../../../../test/env";

import { describe, it, expect, beforeEach, vi } from "vitest";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

// 스토리지는 목: 실제 Supabase 버킷을 건드리지 않는다.
const storageState = vi.hoisted(() => ({
  downloads: [] as string[],
  objects: {} as Record<string, { type: string }>,
  throwOnClient: false,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        download: async (path: string) => {
          storageState.downloads.push(path);
          const object = storageState.objects[path];
          if (!object) return { data: null, error: { message: "not found" } };
          return { data: new Blob([PNG], { type: object.type }), error: null };
        },
      }),
    },
  }),
}));

function req(path: string): Request {
  return new Request("http://localhost" + path);
}

beforeEach(() => {
  storageState.downloads = [];
  storageState.objects = {};
});

const key = "11111111-1111-1111-1111-111111111111.png";
const missingKey = "22222222-2222-2222-2222-222222222222.png";

describe("GET /api/problem-images/[key]", () => {
  it("정상 키는 오브젝트를 그대로 내보낸다", async () => {
    storageState.objects[key] = { type: "image/png" };
    const { GET } = await import("./route");
    const res = await GET(req("/api/problem-images/" + key), { params: Promise.resolve({ key }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
  });

  it("Blob 의 content-type 이 비어 있으면 application/octet-stream 으로 대체한다", async () => {
    // 업로드는 content-type 허용목록을 강제하지만, 그 밖에서 올라온 오브젝트나 스토리지 SDK
    // 변경으로 빈 타입이 내려오면 fallback 이 실제로 쓰인다 — 앱 원점에서 text/html 로 나가면
    // problemImage.ts 의 svg 배제와 같은 종류의 저장형 XSS 통로가 된다.
    storageState.objects[key] = { type: "" };
    const { GET } = await import("./route");
    const res = await GET(req("/api/problem-images/" + key), { params: Promise.resolve({ key }) });
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("삭제된 오브젝트는 404 다", async () => {
    // 실제로 이 상태의 행이 하나 있다 — M7 이 버킷을 비우면서 생겼다
    // (2026-08-19-problem-bank-e2e-verification.md I12).
    const { GET } = await import("./route");
    const res = await GET(req("/api/problem-images/" + missingKey), { params: Promise.resolve({ key: missingKey }) });
    expect(res.status).toBe(404);
  });

  it("키 형식이 아니면 스토리지를 건드리지 않고 404 다", async () => {
    // 경로 탈출·임의 오브젝트 열람을 키 형식으로 막는다. 네 항목은 각각 KEY_PATTERN 의 서로
    // 다른 제약 하나씩만 깨뜨린다 — 문자 클래스가 아니라 그 제약 자체가 지켜지는지를 본다.
    storageState.objects[key] = { type: "image/png" }; // 형식이 맞았다면 통과했을 오브젝트를 심어둔다
    const { GET } = await import("./route");
    const badKeys = [
      // uuid 부분이 35 자(마지막 hex 한 글자를 뺐다) — 문자 종류는 전부 유효하다.
      // {36} 을 지우면(예: `+`) 이 키만 통과한다.
      "11111111-1111-1111-1111-11111111111.png",
      // 하이픈 하나를 슬래시로 바꿔치기 — 길이는 그대로 36 이다.
      // 문자 클래스에 슬래시를 허용하면(예: [0-9a-f-/]) 이 키만 통과한다.
      "11111111-1111/1111-1111-111111111111.png",
      // 확장자 자리에 점이 하나 더 있다 — 확장자 문자 클래스가 점을 허용하면 이 키만 통과한다.
      key + ".png",
      // uuid 마지막 글자가 대문자다 — 문자 클래스가 대소문자를 가리지 않으면 이 키만 통과한다.
      "11111111-1111-1111-1111-11111111111A.png",
    ];
    for (const bad of badKeys) {
      const res = await GET(req("/api/problem-images/" + bad), { params: Promise.resolve({ key: bad }) });
      expect(res.status).toBe(404);
    }
    expect(storageState.downloads).toEqual([]); // 네 경우 모두 스토리지 호출 자체가 없어야 한다
  });

  it("응답 봉투를 쓰지 않는다 — 바이너리다", async () => {
    storageState.objects[key] = { type: "image/png" };
    const { GET } = await import("./route");
    const res = await GET(req("/api/problem-images/" + key), { params: Promise.resolve({ key }) });
    expect(res.headers.get("content-type")).not.toContain("application/json");
  });

  it("캐시는 공유 캐시에 남기지 않는다(private)", async () => {
    storageState.objects[key] = { type: "image/png" };
    const { GET } = await import("./route");
    const res = await GET(req("/api/problem-images/" + key), { params: Promise.resolve({ key }) });
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("스토리지 클라이언트를 만들 수 없으면(환경변수 누락) 500 이다 — 500 HTML 페이지로 새지 않는다", async () => {
    const original = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    vi.resetModules();
    try {
      const { GET } = await import("./route");
      const res = await GET(req("/api/problem-images/" + key), { params: Promise.resolve({ key }) });
      expect(res.status).toBe(500);
    } finally {
      // 단언이 실패해도 이후 테스트를 위해 반드시 복원한다 — 그렇지 않으면 이 파일의 남은
      // 모든 테스트에서 SUPABASE_URL 이 계속 지워진 채로 남는다.
      process.env.SUPABASE_URL = original;
      vi.resetModules();
    }
  });
});
