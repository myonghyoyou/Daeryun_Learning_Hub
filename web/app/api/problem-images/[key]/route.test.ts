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
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
  });

  it("삭제된 오브젝트는 404 다", async () => {
    // 실제로 이 상태의 행이 하나 있다 — M7 이 버킷을 비우면서 생겼다
    // (2026-08-19-problem-bank-e2e-verification.md I12).
    const { GET } = await import("./route");
    const res = await GET(req("/api/problem-images/" + missingKey), { params: Promise.resolve({ key: missingKey }) });
    expect(res.status).toBe(404);
  });

  it("키 형식이 아니면 스토리지를 건드리지 않고 404 다", async () => {
    // 경로 탈출·임의 오브젝트 열람을 키 형식으로 막는다.
    storageState.objects[key] = { type: "image/png" }; // 형식이 맞았다면 통과했을 오브젝트를 심어둔다
    const { GET } = await import("./route");
    for (const bad of ["../secret.png", "a/b.png", "not-a-uuid.png", key + ".png.exe"]) {
      const res = await GET(req("/api/problem-images/" + bad), { params: Promise.resolve({ key: bad }) });
      expect(res.status).toBe(404);
    }
    expect(storageState.downloads).toEqual([]); // 호출 자체가 없어야 한다
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
    const { GET } = await import("./route");
    const res = await GET(req("/api/problem-images/" + key), { params: Promise.resolve({ key }) });
    expect(res.status).toBe(500);
    process.env.SUPABASE_URL = original;
    vi.resetModules();
  });
});
