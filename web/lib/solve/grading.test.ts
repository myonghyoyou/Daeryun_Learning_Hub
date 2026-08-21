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
    expect(normalizeAnswer(" 가 ")).toBe(" 가 ");
    expect(normalizeAnswer("가")).toBe("가"); // 제어문자는 U+0020 이하라 깎인다
  });

  it("G8: toLocaleLowerCase 가 아니라 toLowerCase 다", () => {
    // Java 의 무인자 toLowerCase() 는 Locale.getDefault() 를 쓰지만(터키어 I→ı),
    // 한글·ASCII 에서는 JS 의 로케일 무관 변환과 결과가 같다. JS 쪽이 서버 로케일 설정에
    // 흔들리지 않아 더 안전하다 — toLocaleLowerCase() 를 쓰면 그 안전성을 버리는 것이다.
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
});

describe("SHORT_ANSWER (G6·G7-1)", () => {
  const sa = (text: string | null) =>
    grade({ type: "SHORT_ANSWER", answers: ["보정계수", "보정 계수"], submittedText: text });
  it("G6: 허용 정답 중 하나라도 맞으면 정답", () => expect(sa("보정 계수").correct).toBe(true));
  it("G7-1: 앞뒤 공백은 무시된다", () => expect(sa("  보정계수  ").correct).toBe(true));
  it("G3: null 은 오답", () => expect(sa(null).correct).toBe(false));
  it("T2-1: 요약은 제출 원문 그대로다", () => expect(sa("  보정계수  ").submittedAnswerSummary).toBe("  보정계수  "));
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
});
