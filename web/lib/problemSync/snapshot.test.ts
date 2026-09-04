import { describe, it, expect } from "vitest";
import { parseSnapshot, SNAPSHOT_VERSION, type ProblemSnapshot } from "./snapshot";

function validSnapshot(): ProblemSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: "2026-09-01T00:00:00.000Z",
    source: { host: "prod.example.com", database: "postgres" },
    counts: { departments: 1, problems: 1, tags: 1 },
    departments: [{ code: "DEV", name: "개발팀", status: "ACTIVE" }],
    problems: [{
      id: 501, type: "MCQ_SINGLE", content: "본문", imageUrl: null, referenceText: null,
      explanation: null, blankRevealCount: null, status: "ACTIVE", departmentCode: "DEV",
      sourceNumber: 3, track: "ADMIN" as const, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      choices: [{ choiceText: "가", isCorrect: true, displayOrder: 1 }],
      answers: [{ answerText: "가" }],
      blanks: [{ blankKey: "a", answerText: "가", displayOrder: 1 }],
      tags: ["안전"],
    }],
  };
}

describe("parseSnapshot", () => {
  it("올바른 스냅샷은 그대로 통과한다", () => {
    const snapshot = validSnapshot();
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("버전이 다르면 거부한다 — 형식이 바뀐 파일을 절반만 읽는 것보다 멈추는 게 낫다", () => {
    const bad = { ...validSnapshot(), version: 99 };
    expect(() => parseSnapshot(bad)).toThrow(/version/);
  });

  it("객체가 아니면 거부한다", () => {
    expect(() => parseSnapshot("문자열")).toThrow(/최상위/);
    expect(() => parseSnapshot(null)).toThrow(/최상위/);
  });

  it("필수 항목이 빠지면 어느 자리인지 알려준다", () => {
    const bad = validSnapshot() as unknown as Record<string, unknown>;
    delete (bad.problems as Record<string, unknown>[])[0].content;
    expect(() => parseSnapshot(bad)).toThrow(/problems\[0\]\.content/);
  });

  it("숫자 자리에 문자열이 오면 거부한다 — id 가 문자열로 새는 것을 여기서 잡는다", () => {
    const bad = validSnapshot() as unknown as { problems: Record<string, unknown>[] };
    bad.problems[0].id = "501";
    expect(() => parseSnapshot(bad)).toThrow(/problems\[0\]\.id/);
  });

  it("문제가 가리키는 부서 코드가 목록에 없으면 거부한다", () => {
    const bad = validSnapshot();
    bad.problems[0].departmentCode = "NOPE";
    expect(() => parseSnapshot(bad)).toThrow(/NOPE/);
  });

  it("직군을 그대로 읽는다", () => {
    const snap = validSnapshot();
    snap.problems[0].track = "TECH";
    expect(parseSnapshot(snap).problems[0].track).toBe("TECH");
  });

  // 버전 1 로 만든 옛 파일에는 track 이 없다. 거절하지 말고 행정직으로 채운다.
  it("직군이 없는 옛 스냅샷도 읽고, 행정직으로 채운다", () => {
    const old = validSnapshot();
    delete (old.problems[0] as Partial<ProblemSnapshot["problems"][number]>).track;
    expect(parseSnapshot(old).problems[0].track).toBe("ADMIN");
  });
});
