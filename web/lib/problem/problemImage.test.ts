// vitest 는 tsx 와 마찬가지로 .env 를 자동으로 읽지 않는다(Next 런타임만 자동 로드한다) — 이 라인이
// 없으면 SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 가 비어 있어 storeProblemImage 가 "설정되지
// 않았습니다" 로 죽는다(bootstrap.ts 와 같은 이유, scripts/bootstrap.ts 주석 참고).
import "dotenv/config";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, users } from "../db/schema";
import { checkImageUrl } from "./imageUrl";
import type { AuthUser } from "../auth/types";

// 스토리지는 목: 실제 Supabase 버킷에는 아무것도 올리지 않는다. DB(감사 로그)는 testDb 로 실측한다.
const storageState = vi.hoisted(() => ({
  uploads: [] as { path: string; contentType: string | undefined }[],
  removed: [] as string[],
  failUpload: false,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string, _body: unknown, options?: { contentType?: string }) => {
          if (storageState.failUpload) return { data: null, error: { message: "boom" } };
          storageState.uploads.push({ path, contentType: options?.contentType });
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          storageState.removed.push(...paths);
          return { data: null, error: null };
        },
      }),
    },
  }),
}));

vi.mock("../db/client", async () => {
  const { testDb: getTestDb } = await import("../../test/db");
  const actual = await vi.importActual<object>("../db/client");
  return { ...actual, getDb: () => getTestDb() };
});

const { storeProblemImage } = await import("./problemImage");

const db = testDb();
let actor: AuthUser;

function fileOf(overrides: Partial<{ fileName: string; contentType: string; size: number }> = {}) {
  const size = overrides.size ?? 1024;
  return {
    buffer: new ArrayBuffer(size),
    fileName: overrides.fileName ?? "photo.png",
    contentType: overrides.contentType ?? "image/png",
    size,
  };
}

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await truncateAll(db);
  storageState.uploads = [];
  storageState.removed = [];
  storageState.failUpload = false;

  const [dept] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning();
  const [user] = await db.insert(users).values({
    employeeNo: "admin", name: "admin", email: "admin@x.local", passwordHash: "h",
    departmentId: dept.id, role: "SUPER_ADMIN",
  }).returning();
  actor = {
    userId: user.id, employeeNo: "admin", name: "admin", role: "SUPER_ADMIN",
    departmentId: dept.id, mustChangePassword: false,
  };
});

describe("storeProblemImage", () => {
  it("5MB 를 넘으면 막는다", async () => {
    await expect(storeProblemImage(fileOf({ size: 5 * 1024 * 1024 + 1 }), actor))
      .rejects.toThrow("이미지 크기는 5MB를 초과할 수 없습니다.");
  });

  it("svg 를 막는다", async () => {
    // SVG 는 인라인 <script> 를 담을 수 있어 저장형 XSS 가 된다.
    await expect(storeProblemImage(fileOf({ fileName: "x.svg", contentType: "image/svg+xml" }), actor))
      .rejects.toThrow("허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.");
  });

  it("확장자와 Content-Type 이 어긋나면 막는다", async () => {
    await expect(storeProblemImage(fileOf({ fileName: "x.png", contentType: "text/html" }), actor))
      .rejects.toThrow("허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.");
  });

  it("파일명을 UUID 로 바꾼다", async () => {
    const url = await storeProblemImage(fileOf({ fileName: "../../etc/passwd.png" }), actor);
    expect(url).toMatch(/^\/api\/problem-images\/[0-9a-f-]{36}\.png$/);
    expect(url).not.toContain("..");
  });

  it("반환한 URL 이 checkImageUrl 을 통과한다", async () => {
    // 업로드가 돌려준 값을 그대로 저장할 수 있어야 두 경로가 맞물린다.
    expect(checkImageUrl(await storeProblemImage(fileOf({}), actor))).toBe("VALID");
  });

  it("버킷에는 UUID 파일명으로, 원본 Content-Type 으로 저장된다", async () => {
    const url = await storeProblemImage(fileOf({ contentType: "image/webp", fileName: "a.webp" }), actor);
    const storedName = url.split("/").pop();
    expect(storageState.uploads).toEqual([{ path: storedName, contentType: "image/webp" }]);
  });

  it("성공 시 감사 로그를 남긴다(I9)", async () => {
    const url = await storeProblemImage(fileOf({}), actor);
    const storedName = url.split("/").pop();
    const [log] = await db.select().from(auditLogs);
    expect(log).toMatchObject({
      actorId: actor.userId, action: "PROBLEM_IMAGE_UPLOADED", targetType: "PROBLEM_IMAGE", targetId: null,
      detail: { fileName: storedName },
    });
  });

  it("스토리지 업로드가 실패하면 처리 실패로 안내한다", async () => {
    storageState.failUpload = true;
    await expect(storeProblemImage(fileOf({}), actor)).rejects.toThrow("이미지 업로드에 실패했습니다.");
    const rows = await db.select().from(auditLogs);
    expect(rows).toHaveLength(0);
  });

  it("감사 로그 기록이 실패하면 fail-closed 로 업로드 파일을 지우고 실패시킨다(I8)", async () => {
    // password 관련 키가 detail 에 있으면 recordAudit 이 거부한다 — 이를 빌려 감사 실패 경로를 재현한다.
    // detail 은 problemImage.ts 가 스스로 조립하므로 여기서는 db.insert 를 깨서 같은 경로를 재현한다.
    await db.delete(users); // actorId 외래키가 끊어져 recordAudit 의 insert 가 실패한다.
    await expect(storeProblemImage(fileOf({}), actor)).rejects.toThrow("이미지 업로드에 실패했습니다.");
    expect(storageState.removed).toHaveLength(1);
    expect(storageState.removed[0]).toBe(storageState.uploads[0]?.path);
  });
});
