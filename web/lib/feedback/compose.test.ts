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

  /**
   * `users.employee_no` 는 varchar(50) 이라 사번 자체가 39자 이상일 수 있다.
   * `(사번)` 이 40자에 딱 맞거나(38자) 넘치면(39·52자) 이름을 넣을 자리조차 없다 —
   * 경계값 38(딱 맞음) · 39(한 칸 넘침) · 52(사번 자체가 상한 초과)를 확인한다.
   */
  it("사번이 길어 괄호까지 40자를 채우면 이름 없이 사번만 낸다", () => {
    const tail38 = "e".repeat(36); // "(" + 36 + ")" = 38자 → room=2, 이름이 아주 조금 남는 경계
    const out38 = composeFrom("김이름", tail38);
    expect(out38.length).toBeLessThanOrEqual(FROM_MAX);
    expect(out38).toContain(`(${tail38})`);

    const tail39 = "e".repeat(38); // "(" + 38 + ")" = 40자 → room 0, 이름 들어갈 자리가 없다
    const out39 = composeFrom("김이름", tail39);
    expect(out39).toBe(tail39.slice(0, FROM_MAX));
    expect(out39.endsWith(")")).toBe(false);

    const emp52 = "e".repeat(52); // varchar(50) 상한을 넘는 극단값 — 사번 자체가 40자보다 길다
    const out52 = composeFrom("김이름", emp52);
    expect(out52.length).toBe(FROM_MAX);
    expect(out52).toBe(emp52.slice(0, FROM_MAX));
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

  /**
   * `validateFeedbackInput` 이 입력을 1000자로 막으므로 `composeBody` 는 그 경로로는
   * 2500자를 볼 일이 없다. 하지만 `retryUnsent`(`feedbackService.ts`)는 저장된 `row.body`
   * 를 **재검증 없이** 곧바로 `composeBody` 에 넘긴다 — seed·백필·수기로 1000자를 넘는
   * 행이 들어오면 이 함수가 유일한 방벽이다. 그래서 `composeBody` 를 직접 2500자로 불러
   * `.slice` 분기 자체를 검증한다.
   *
   * 확인할 것은 셋: (1) 결과가 정확히 2000자여야 하고, (2) 머리말(태그·"문제 …" 줄·
   * "화면:" 줄)이 통째로 살아 있어야 하며, (3) 잘려 나가는 것은 사용자 원문의 꼬리여야
   * 한다 — 머리말이 조금이라도 깎이면 문제 참조가 사라져 카드가 쓸모없어진다.
   */
  it("2500자를 넣으면 정확히 2000자로 자르되 머리말은 통째로 남고 잘리는 것은 원문 꼬리다", () => {
    // 앞부분과 뒷부분을 서로 다른 글자로 채워서, 잘려 나가는 것이 정말 "꼬리"인지
    // (뒤쪽 'ㅎ' 이 사라지는지) 눈으로도 확인할 수 있게 한다.
    const longBody = "가".repeat(2400) + "ㅎ".repeat(100);
    const out = composeBody({ body: longBody, sourcePath: "/solve/random/play", problem });

    expect(out.length).toBe(FEEDBACK_MAX_BODY);

    // 첫 줄(태그+사용자 첫 줄 60자)은 통째로 있어야 한다.
    const first = out.split("\n")[0];
    expect(first).toBe("[자금팀 26번] " + "가".repeat(60 - "[자금팀 26번] ".length));

    // 문제 참조 줄·화면 줄도 통째로 있어야 한다 — 이게 잘리면 카드가 쓸모없어진다.
    expect(out).toContain("문제 260 · 주관식 · 자금팀 26번");
    expect(out).toContain("화면: /solve/random/play");

    // 잘려 나간 것은 원문 꼬리다: 뒤쪽에 붙인 'ㅎ' 이 결과에 하나도 남지 않아야 한다.
    expect(out).not.toContain("ㅎ");
    // 원문 앞부분('가')은 살아 있어야 한다.
    expect(out).toContain("가".repeat(50));
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

  /**
   * `departments.name` 은 varchar(100) 이라 부서명이 아주 길 수 있다. 태그 안 부서명을
   * 줄이지 않으면 태그만으로 60자를 넘겨 사용자 첫 줄이 들어갈 자리가 없어진다 — 태그만
   * 남은 제목은 스펙이 금지한 상태다("보드에서 구분이 안 된다").
   */
  it("부서명이 아주 길어도 제목에 사용자 첫 줄이 살아남는다", () => {
    const longDeptProblem = { ...problem, departmentName: "가".repeat(90) };
    const out = composeBody({ body: "이상합니다", sourcePath: null, problem: longDeptProblem });
    const first = out.split("\n")[0];
    expect(first.length).toBeLessThanOrEqual(60);
    expect(first).toContain("이상합니다");
  });
});
