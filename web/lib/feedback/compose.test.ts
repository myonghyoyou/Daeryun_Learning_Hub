import { describe, it, expect } from "vitest";
import { composeBody, composeFrom, FEEDBACK_MAX_BODY, FROM_MAX } from "./compose";

const problem = { id: 260, type: "SHORT_ANSWER", sourceNumber: 26, departmentName: "자금팀" };

describe("composeFrom", () => {
  it("이름과 사번을 함께 낸다", () => {
    expect(composeFrom("기획팀직원", "plan_emp")).toBe("기획팀직원(plan_emp)");
  });

  /** 사번이 잘리면 되묻는 길이 끊긴다. 이름 쪽을 줄인다. */
  it("40자를 넘으면 사번을 살리고 이름을 자른다", () => {
    const out = composeFrom("가".repeat(60), "emp_00001");
    expect(out.length).toBeLessThanOrEqual(FROM_MAX);
    expect(out).toContain("(emp_00001)");
  });
});

describe("composeBody", () => {
  it("문제별 신고는 첫 줄에 [부서 N번] 과 사용자 첫 줄을 함께 둔다", () => {
    const out = composeBody({ body: "괄호 안에 답이 보입니다", sourcePath: "/solve/random/play", problem });
    const first = out.split("\n")[0];
    expect(first).toBe("[자금팀 26번] 괄호 안에 답이 보입니다");
    // 제목은 60자에서 잘린다 — 태그만 남고 뜻이 사라지면 보드에서 구분이 안 된다.
    expect(first.length).toBeLessThanOrEqual(60);
    expect(out).toContain("문제 260");
    expect(out).toContain("/solve/random/play");
  });

  it("문제가 없고 경로가 /admin 이면 [관리자] 다", () => {
    const out = composeBody({ body: "필터가 초기화됩니다", sourcePath: "/admin/stats", problem: null });
    expect(out.split("\n")[0]).toBe("[관리자] 필터가 초기화됩니다");
    expect(out).not.toContain("문제 ");
  });

  it("그 밖에는 [학습] 이다", () => {
    expect(composeBody({ body: "엔터가 안 됩니다", sourcePath: "/solve", problem: null })
      .split("\n")[0]).toBe("[학습] 엔터가 안 됩니다");
    expect(composeBody({ body: "엔터가 안 됩니다", sourcePath: null, problem: null })
      .split("\n")[0]).toBe("[학습] 엔터가 안 됩니다");
  });

  it("여러 줄이면 첫 줄만 제목에 쓰고 원문은 전부 남긴다", () => {
    const out = composeBody({ body: "첫 줄\n둘째 줄", sourcePath: null, problem: null });
    expect(out.split("\n")[0]).toBe("[학습] 첫 줄");
    expect(out).toContain("둘째 줄");
  });

  it("조립 후 2000자를 넘지 않는다 — 머리말이 아니라 원문 끝을 자른다", () => {
    const out = composeBody({ body: "가".repeat(1000), sourcePath: "/solve", problem });
    expect(out.length).toBeLessThanOrEqual(FEEDBACK_MAX_BODY);
    expect(out.split("\n")[0]).toContain("[자금팀 26번]");
    expect(out).toContain("문제 260");
  });

  it("번호 없는 문제도 태그를 만든다", () => {
    const out = composeBody({
      body: "이상합니다", sourcePath: null,
      problem: { ...problem, sourceNumber: null },
    });
    expect(out.split("\n")[0]).toBe("[자금팀 번호없음] 이상합니다");
  });

  /**
   * 첫 줄이 길면 제목이 60자에서 잘리는데, 태그까지 잘려 나가면 "[자금팀 26..." 이 되어
   * 보드에서 아무 뜻이 없어진다. 태그는 항상 온전해야 한다.
   */
  it("첫 줄이 길어도 태그는 잘리지 않는다", () => {
    const out = composeBody({ body: "가".repeat(200), sourcePath: null, problem });
    const first = out.split("\n")[0];
    expect(first.length).toBeLessThanOrEqual(60);
    expect(first.startsWith("[자금팀 26번] ")).toBe(true);
  });

  it("첫 줄 뒤에 빈 줄이 있어도 제목은 첫 줄이다", () => {
    const out = composeBody({ body: "제목입니다\n\n본문입니다", sourcePath: null, problem: null });
    expect(out.split("\n")[0]).toBe("[학습] 제목입니다");
    expect(out).toContain("본문입니다");
  });
});
