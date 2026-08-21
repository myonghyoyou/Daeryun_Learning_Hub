import { describe, it, expect } from "vitest";
import { normalizeAnswer, grade } from "./grading";

describe("normalizeAnswer — SolveServiceImpl.java:209-211 미러", () => {
  it("G6: null 과 undefined 는 빈 문자열이다", () => {
    expect(normalizeAnswer(null)).toBe("");
    expect(normalizeAnswer(undefined)).toBe("");
  });

  it("G7: 앞뒤를 깎고 소문자로 만들고 연속 공백을 하나로 접는다", () => {
    expect(normalizeAnswer("  AB   cd  ")).toBe("ab cd");
  });

  it("G7-1: 공백은 접힐 뿐 없어지지 않는다", () => {
    // 이 두 줄이 판별자다. 구현이 공백을 '삭제'하면 아래가 깨진다.
    expect(normalizeAnswer("  보정계수  ")).toBe("보정계수");
    expect(normalizeAnswer("보정 계수")).toBe("보정 계수");
    expect(normalizeAnswer("보정 계수")).not.toBe("보정계수");
  });

  it("Java 의 trim 은 U+0020 이하만 깎는다 — JS 기본 trim 을 쓰면 안 된다", () => {
    // U+00A0 는 Java trim 이 남기고 Java \s 도 안 잡는다. JS 기본 동작과 반대다.
    expect(normalizeAnswer("\u00A0가\u00A0")).toBe("\u00A0가\u00A0");
    expect(normalizeAnswer("\u0001가\u0001")).toBe("가"); // 제어문자는 U+0020 이하라 깎인다
  });

  it("JAVA_WHITESPACE 는 \\x0B(수직 탭)도 접는다 — 문자 클래스에서 이 바이트가 빠지면 조용히 통과한다", () => {
    // 가장자리는 javaTrim 이 이미 덮는다. 이 테스트는 문자열 *내부*의 \x0B 가 접히는지를 본다 —
    // JAVA_WHITESPACE 문자 클래스에서 \u000B 가 빠지면(리포맷·"보이지 않는 문자 제거" 같은 작업으로
    // 흔히 사라진다) 아래가 깨진다.
    expect(normalizeAnswer("a\u000B\u000Bb")).toBe("a b");
  });

  it("소문자 변환이 일어난다 — JS 에는 toLowerCase 와 toLocaleLowerCase 를 구분하는 무인자 단언이 없다", () => {
    // Java 의 무인자 toLowerCase() 는 Locale.getDefault() 를 쓰지만(터키어 I→ı),
    // 한글·ASCII 에서는 JS 의 로케일 무관 변환과 결과가 같다. 이 테스트가 실제로 고정하는 것은
    // "소문자화가 일어난다"는 사실뿐이다 — locale 인자 없이는 toLowerCase 와 toLocaleLowerCase 를
    // 가르는 JS 단언을 쓸 수 없으므로, 그 구분은 코드 주석으로만 남긴다.
    expect(normalizeAnswer("ABC")).toBe("abc");
    expect(normalizeAnswer("가나다")).toBe("가나다");
  });
});

const mcq = (selected: number[] | null) =>
  grade({
    type: "MCQ_SINGLE",
    choices: [
      { id: 1, choiceText: "가", isCorrect: true },
      { id: 2, choiceText: "나", isCorrect: false },
    ],
    selectedChoiceIds: selected,
  });

describe("MCQ·OX — 집합 동등성(G2~G5)", () => {
  it("G2: 정답 집합과 같으면 정답", () => expect(mcq([1]).correct).toBe(true));
  it("G2: 다르면 오답", () => expect(mcq([2]).correct).toBe(false));
  it("G4: 같은 id 를 두 번 보내도 접힌다", () => expect(mcq([1, 1]).correct).toBe(true));
  it("G2: 과다 선택은 오답", () => expect(mcq([1, 2]).correct).toBe(false));
  it("G3: null 은 빈 집합", () => expect(mcq(null).correct).toBe(false));
  it("G3: 빈 배열도 빈 집합", () => expect(mcq([]).correct).toBe(false));
  it("G5: 남의 문제 choiceId 는 오답이고 선택 목록에도 안 들어간다", () => {
    const r = mcq([99]);
    expect(r.correct).toBe(false);
    expect(r.selectedChoices).toEqual([]);
  });
  it("T3: 요약은 선택지 본문을 문제 정의 순서로 잇는다", () => {
    const r = grade({
      type: "MCQ_MULTI",
      choices: [
        { id: 9, choiceText: "가", isCorrect: true },
        { id: 10, choiceText: "나", isCorrect: true },
      ],
      selectedChoiceIds: [10, 9], // 제출 순서를 뒤집어 보낸다
    });
    expect(r.correct).toBe(true);
    expect(r.submittedAnswerSummary).toBe("가, 나"); // 제출 순서였다면 "나, 가"
    expect(r.selectedChoices.map((c) => c.id)).toEqual([9, 10]);
  });
  it("G14: MCQ·OX 는 blankResults 가 null 이다", () => {
    expect(mcq([1]).blankResults).toBeNull();
  });
});

describe("SHORT_ANSWER (G6·G7-1)", () => {
  const sa = (text: string | null) =>
    grade({ type: "SHORT_ANSWER", answers: ["보정계수", "보정 계수"], submittedText: text });
  it("G6: 허용 정답 중 하나라도 맞으면 정답", () => expect(sa("보정 계수").correct).toBe(true));
  it("G7-1: 앞뒤 공백은 무시된다", () => expect(sa("  보정계수  ").correct).toBe(true));
  it("G3: null 은 오답", () => expect(sa(null).correct).toBe(false));
  it("T2-1: 요약은 제출 원문 그대로다", () => expect(sa("  보정계수  ").submittedAnswerSummary).toBe("  보정계수  "));
  it("G14: SHORT_ANSWER 는 blankResults 가 null 이다", () => {
    expect(sa("보정계수").blankResults).toBeNull();
  });
  it("G6·G7: 저장된 허용 정답 쪽도 normalize 된다 — 제출 쪽만 normalize 하면 이 케이스가 오답으로 갈린다", () => {
    // Java 는 answers.stream().anyMatch(a -> normalize(a).equals(normalize(submitted))) 로
    // 양쪽 다 normalize 한다(:132). 정답이 "  ABC  " 로 저장돼 있어도(관리자가 트리밍 없이 입력)
    // "abc" 제출은 정답이어야 한다.
    const r = grade({ type: "SHORT_ANSWER", answers: ["  ABC  "], submittedText: "abc" });
    expect(r.correct).toBe(true);
  });
});

describe("FILL_BLANK (G9~G13)", () => {
  const base = {
    type: "FILL_BLANK" as const,
    blanks: [
      { blankKey: "a", answerText: "서울" },
      { blankKey: "b", answerText: "한라산" },
    ],
    blankRevealCount: 2,
  };
  const fb = (answers: { blankKey: string; submittedAnswer: string | null }[] | null) =>
    grade({ ...base, blankAnswers: answers });

  it("G12: 전부 맞아야 정답", () => {
    expect(
      fb([
        { blankKey: "a", submittedAnswer: "서울" },
        { blankKey: "b", submittedAnswer: "한라산" },
      ]).correct
    ).toBe(true);
    expect(
      fb([
        { blankKey: "a", submittedAnswer: "서울" },
        { blankKey: "b", submittedAnswer: "오답" },
      ]).correct
    ).toBe(false);
  });

  it("G13: blankResults 에 정답이 함께 나온다", () => {
    const r = fb([
      { blankKey: "a", submittedAnswer: "서울" },
      { blankKey: "b", submittedAnswer: "오답" },
    ]);
    expect(r.blankResults).toEqual([
      { blankKey: "a", submittedAnswer: "서울", correct: true, correctAnswer: "서울" },
      { blankKey: "b", submittedAnswer: "오답", correct: false, correctAnswer: "한라산" },
    ]);
  });

  it("blankResults 순서는 제출 순서를 따른다 — [b, a] 로 보내면 결과와 요약도 [b, a] 순이다", () => {
    // MCQ 의 T3(정의 순서 고정)와 정반대다: Java 는 FILL_BLANK 에서 submitted 리스트를 그대로
    // for 문으로 돌며 blankResults 를 쌓는다(:152-159) — 정의 순서로 재배열하지 않는다.
    const r = fb([
      { blankKey: "b", submittedAnswer: "한라산" },
      { blankKey: "a", submittedAnswer: "서울" },
    ]);
    expect(r.blankResults!.map((x) => x.blankKey)).toEqual(["b", "a"]);
    expect(r.submittedAnswerSummary).toBe("한라산, 서울");
  });

  it("빈칸이 5개인 문제에서 2개만 묻는 정상 경로 — blanks.length 와 blankRevealCount 가 다르다", () => {
    // 기존 fixture 는 blanks.length === blankRevealCount === 2 인 퇴화 케이스라 blankRevealCount
    // 검증을 blanks.length 검증으로 바꿔도 걸리지 않는다. getDetail 이 blankRevealCount 개만큼
    // 무작위로 골라 물어보므로(Q5/Q8), 실제로는 blanks.length > blankRevealCount 인 부분 제출이
    // 정상 경로다.
    const wide = {
      type: "FILL_BLANK" as const,
      blanks: [
        { blankKey: "a", answerText: "서울" },
        { blankKey: "b", answerText: "한라산" },
        { blankKey: "c", answerText: "제주도" },
      ],
      blankRevealCount: 2,
    };
    const r = grade({
      ...wide,
      blankAnswers: [
        { blankKey: "a", submittedAnswer: "서울" },
        { blankKey: "b", submittedAnswer: "한라산" },
      ],
    });
    expect(r.correct).toBe(true);
  });

  // G9·G10·G11 은 세 조건이 한 if 로 묶여 있어 **문구가 구분되지 않는다**.
  // 나눠서 다른 문구를 내면 파리티 위반이다.
  const MSG = "제출한 빈칸 개수가 올바르지 않습니다.";
  it("G11: 개수가 blankRevealCount 와 다르면", () =>
    expect(() => fb([{ blankKey: "a", submittedAnswer: "서울" }])).toThrow(
      expect.objectContaining({ message: MSG })
    ));
  it("G9: 중복 키면 같은 문구", () =>
    expect(() =>
      fb([
        { blankKey: "a", submittedAnswer: "x" },
        { blankKey: "a", submittedAnswer: "y" },
      ])
    ).toThrow(expect.objectContaining({ message: MSG })));
  it("G10: 정의되지 않은 키면 같은 문구", () =>
    expect(() =>
      fb([
        { blankKey: "a", submittedAnswer: "x" },
        { blankKey: "zz", submittedAnswer: "y" },
      ])
    ).toThrow(expect.objectContaining({ message: MSG })));
  it("G3: null 도 같은 문구(개수 0 != 2)", () =>
    expect(() => fb(null)).toThrow(expect.objectContaining({ message: MSG })));

  it("T4: 요약은 답만 잇고, 빈 칸은 (미입력) 이다", () => {
    const r = fb([
      { blankKey: "a", submittedAnswer: "서울" },
      { blankKey: "b", submittedAnswer: "   " },
    ]);
    expect(r.submittedAnswerSummary).toBe("서울, (미입력)");
  });

  it("T4: describeBlanks 는 Java String.trim() 을 쓴다 — U+00A0·U+3000 만 있는 제출은 (미입력) 이 아니다", () => {
    // Java describeBlanks(:236) 는 String.trim() 이라 U+0020 이하만 깎는다고 생각하기 쉽지만,
    // isEmpty() 앞의 trim() 자체가 그 기준이다 — 실측 판별은 반대다: U+00A0·U+3000 은 Java trim
    // 이 "공백 아님"으로 보고 남기므로 isEmpty() 가 false 가 되어 원문이 그대로 저장된다.
    // JS trim() 을 쓰면 이 문자들이 깎여 isEmpty() 가 true 가 되고 "(미입력)" 으로 잘못 갈린다.
    const r = fb([
      { blankKey: "a", submittedAnswer: "\u00A0" },
      { blankKey: "b", submittedAnswer: "\u3000" },
    ]);
    expect(r.submittedAnswerSummary).toBe("\u00A0, \u3000");
  });
});
