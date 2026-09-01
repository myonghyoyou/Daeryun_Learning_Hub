import { describe, it, expect } from "vitest";
import { SNAPSHOT_VERSION } from "./snapshot";
import { assertProdSource, buildSnapshot, type ExportRows } from "./exportSnapshot";

describe("assertProdSource", () => {
  it("설정이 없으면 어디에 넣어야 하는지 알려준다", () => {
    expect(() => assertProdSource({})).toThrow(/PROD_DATABASE_URL/);
  });

  it("로컬을 가리키면 거부한다 — 운영 자리에 로컬을 넣은 실수를 잡는다", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(() => assertProdSource({ PROD_DATABASE_URL: `postgres://u:p@${host}:5432/db` }))
        .toThrow(/로컬/);
    }
  });

  it("URL 로 해석되지 않으면 거부한다 — 확인할 수 없으니 통과시키면 가드가 무의미하다", () => {
    expect(() => assertProdSource({ PROD_DATABASE_URL: "그냥문자열" })).toThrow(/해석/);
  });

  it("원격 주소면 그 값을 그대로 돌려준다", () => {
    const url = "postgres://u:p@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres";
    expect(assertProdSource({ PROD_DATABASE_URL: url })).toBe(url);
  });
});

function rowsFixture(): ExportRows {
  return {
    departments: [
      { code: "DEV", name: "개발팀", status: "ACTIVE" },
      { code: "GONE", name: "폐지팀", status: "INACTIVE" },
    ],
    problems: [
      {
        id: 501, type: "MCQ_SINGLE", content: "본문1", imageUrl: null, referenceText: null,
        explanation: "해설", blankRevealCount: null, status: "ACTIVE", departmentCode: "DEV",
        sourceNumber: 3, createdAt: "2026-08-01 00:00:00", updatedAt: "2026-08-02 00:00:00",
      },
      {
        id: 502, type: "SHORT_ANSWER", content: "본문2", imageUrl: null, referenceText: null,
        explanation: null, blankRevealCount: null, status: "ARCHIVED", departmentCode: "DEV",
        sourceNumber: 4, createdAt: "2026-08-03 00:00:00", updatedAt: "2026-08-04 00:00:00",
      },
    ],
    choices: [
      { problemId: 501, choiceText: "가", isCorrect: true, displayOrder: 1 },
      { problemId: 501, choiceText: "나", isCorrect: false, displayOrder: 2 },
    ],
    answers: [{ problemId: 502, answerText: "정답" }],
    blanks: [{ problemId: 502, blankKey: "a", answerText: "정답", displayOrder: 1 }],
    problemTags: [
      { problemId: 501, name: "안전" },
      { problemId: 502, name: "안전" },
      { problemId: 502, name: "법규" },
    ],
  };
}

describe("buildSnapshot", () => {
  it("자식 행을 문제별로 묶는다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "prod.example.com", database: "postgres" });

    const [first, second] = snapshot.problems;
    expect(first.id).toBe(501);
    expect(first.choices).toEqual([
      { choiceText: "가", isCorrect: true, displayOrder: 1 },
      { choiceText: "나", isCorrect: false, displayOrder: 2 },
    ]);
    expect(first.answers).toEqual([]);
    expect(first.tags).toEqual(["안전"]);

    expect(second.answers).toEqual([{ answerText: "정답" }]);
    expect(second.blanks).toEqual([{ blankKey: "a", answerText: "정답", displayOrder: 1 }]);
    expect(second.tags).toEqual(["안전", "법규"]);
  });

  it("보관된 문제도 담는다 — 빼면 부서별 문항 번호에 구멍이 생긴다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    expect(snapshot.problems.map((p) => p.status)).toEqual(["ACTIVE", "ARCHIVED"]);
  });

  it("timestamp(무 tz) 텍스트를 UTC 로 읽는다 — 내보내는 머신의 시간대에 흔들리면 안 된다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    // new Date("2026-08-01 00:00:00") 은 V8 이 로컬 시각으로 읽어 UTC+9 머신에서 9시간 밀린다.
    // parseUtcTimestamp 를 거치면 시간대와 무관하게 같은 값이 나온다.
    expect(snapshot.problems[0].createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(snapshot.problems[0].updatedAt).toBe("2026-08-02T00:00:00.000Z");
    expect(typeof snapshot.generatedAt).toBe("string");
  });

  it("버전과 건수를 채운다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
    expect(snapshot.counts).toEqual({ departments: 2, problems: 2, tags: 2 });
  });

  it("문제가 없는 부서도 담는다 — 로컬 부서 목록도 운영과 같아져야 한다", () => {
    const snapshot = buildSnapshot(rowsFixture(), { host: "h", database: "d" });
    expect(snapshot.departments.map((d) => d.code)).toEqual(["DEV", "GONE"]);
  });
});
