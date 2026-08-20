import { describe, expect, it } from "vitest";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import { IMAGE_URL_PREFIX } from "./imageUrl";
import {
  normalizeProblemRequest,
  normalizeTags,
  validateProblem,
  validateSourceNumber,
  type ProblemCreateInput,
} from "./problemValidation";

const base = { type: "MCQ_SINGLE" as const, content: "본문", sourceNumber: 1 };
const choice = (text: string, correct = false) => ({ text, correct });
const expectMessage = (fn: () => void, message: string) => {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  // 이 모듈의 모든 메시지는 계약상 ErrorCode.INPUT_VALUE_INVALID(resultCode 1000 → HTTP 400)다.
  // 메시지만 확인하면 invalid()의 코드가 바뀌어도 여기서는 통과하고, M3의 라우트 테스트에서야
  // 드러난다.
  expect(error).toBeInstanceOf(BizError);
  expect((error as BizError).errorCode.code).toBe(ErrorCode.INPUT_VALUE_INVALID.code);
  expect((error as Error).message).toBe(message);
};

describe("validateProblem — common", () => {
  it("blocks a missing type first, ahead of every other check", () => {
    // If type is skipped, no switch branch runs and validation silently passes.
    expectMessage(
      () => validateProblem({ ...base, type: null as never, content: null as never }),
      "문제 유형을 선택하세요.",
    );
  });
  it("rejects blank content with the exact message", () => {
    expectMessage(() => validateProblem({ ...base, content: null as never }), "문제 내용을 입력하세요.");
  });
  it("rejects an external image URL", () => {
    expectMessage(
      () =>
        validateProblem({
          ...base,
          imageUrl: "https://evil/x.png",
          choices: [choice("가", true), choice("나")],
        }),
      "이미지는 이미지 업로드 API로 등록한 경로(/uploads/images/...)만 사용할 수 있습니다.",
    );
  });
  it("rejects an image URL over 500 characters", () => {
    expectMessage(
      () =>
        validateProblem({
          ...base,
          imageUrl: IMAGE_URL_PREFIX + "a".repeat(500),
          choices: [choice("가", true), choice("나")],
        }),
      "이미지 경로는 500자 이하여야 합니다.",
    );
  });
});

describe("validateProblem — multiple choice", () => {
  it("rejects 1 choice", () => {
    expectMessage(
      () => validateProblem({ ...base, choices: [choice("가", true)] }),
      "보기는 2개 이상 5개 이하이어야 합니다.",
    );
  });
  it("rejects 6 choices", () => {
    expectMessage(
      () =>
        validateProblem({
          ...base,
          choices: Array.from({ length: 6 }, (_, i) => choice(`보기${i}`, i === 0)),
        }),
      "보기는 2개 이상 5개 이하이어야 합니다.",
    );
  });
  it("rejects a blank choice", () => {
    expectMessage(
      () => validateProblem({ ...base, choices: [choice("가", true), choice("")] }),
      "빈 보기는 입력할 수 없습니다.",
    );
  });
  it("rejects a choice over 500 characters", () => {
    expectMessage(
      () => validateProblem({ ...base, choices: [choice("가", true), choice("나".repeat(501))] }),
      "보기는 500자 이하여야 합니다.",
    );
  });
  it("rejects 2 correct answers for a single-answer question", () => {
    expectMessage(
      () => validateProblem({ ...base, choices: [choice("가", true), choice("나", true)] }),
      "정답 개수가 올바르지 않습니다.",
    );
  });
  it("rejects 0 correct answers for a multi-answer question", () => {
    expectMessage(
      () => validateProblem({ ...base, type: "MCQ_MULTI", choices: [choice("가"), choice("나")] }),
      "정답을 최소 1개 선택하세요.",
    );
  });
  it("requires OX to have exactly 2 choices", () => {
    expectMessage(
      () =>
        validateProblem({
          ...base,
          type: "OX",
          choices: [choice("O", true), choice("X"), choice("?")],
        }),
      "OX 문제는 보기 2개(O/X)가 필요합니다.",
    );
  });
  it("prioritizes the OX choice-count violation over the answer-count violation", () => {
    // 3 choices AND 2 correct at once — the count check must win, not the answer-count check.
    expectMessage(
      () =>
        validateProblem({
          ...base,
          type: "OX",
          choices: [choice("O", true), choice("X", true), choice("?")],
        }),
      "OX 문제는 보기 2개(O/X)가 필요합니다.",
    );
  });
});

describe("validateProblem — short answer", () => {
  const sa = (over: object) => ({ type: "SHORT_ANSWER" as const, content: "본문", sourceNumber: 1, answers: ["서울"], ...over });

  it("passes with a valid answer", () => {
    expect(() => validateProblem(sa({}))).not.toThrow();
  });
  it("rejects an empty answers list", () => {
    expectMessage(() => validateProblem(sa({ answers: [] })), "정답을 최소 1개 입력하세요.");
  });
  it("rejects a blank answer item", () => {
    expectMessage(() => validateProblem(sa({ answers: ["서울", "  "] })), "빈 정답은 입력할 수 없습니다.");
  });
  it("rejects an answer over 500 characters", () => {
    expectMessage(() => validateProblem(sa({ answers: ["가".repeat(501)] })), "정답은 500자 이하여야 합니다.");
  });
});

describe("validateProblem — fill in the blank", () => {
  const fb = (over: object) => ({
    type: "FILL_BLANK" as const,
    content: "수도는 {{b1}}이다",
    sourceNumber: 1,
    blankRevealCount: 1,
    blanks: [{ blankKey: "b1", answerText: "서울" }],
    ...over,
  });

  it("passes when everything is consistent", () => {
    expect(() => validateProblem(fb({}))).not.toThrow();
  });
  it("rejects no blanks defined", () => {
    expectMessage(() => validateProblem(fb({ blanks: [] })), "빈칸을 최소 1개 정의하세요.");
  });
  it("rejects a blank key or answer that is empty", () => {
    expectMessage(
      () => validateProblem(fb({ blanks: [{ blankKey: "b1", answerText: "  " }] })),
      "빈칸 키와 정답을 모두 입력하세요.",
    );
  });
  it("rejects a blank key over 50 characters", () => {
    expectMessage(
      () => validateProblem(fb({ blanks: [{ blankKey: "b".repeat(51), answerText: "서울" }] })),
      "빈칸 키는 50자 이하여야 합니다.",
    );
  });
  it("rejects a blank answer over 500 characters", () => {
    expectMessage(
      () => validateProblem(fb({ blanks: [{ blankKey: "b1", answerText: "가".repeat(501) }] })),
      "빈칸 정답은 500자 이하여야 합니다.",
    );
  });
  it("checks all three per-blank rules on one blank before moving to the next (matches Java's single-pass loop)", () => {
    // The first blank violates only the key-length rule; the second violates only the
    // blank-answer rule. Java inspects blank #1 fully before ever looking at #2, so the
    // key-length message must win — a per-rule full-list scan would report the second
    // blank's violation instead, because it would find it while scanning for blank answers
    // across every blank first.
    expectMessage(
      () =>
        validateProblem(
          fb({
            blanks: [
              { blankKey: "b".repeat(51), answerText: "정상" },
              { blankKey: "b2", answerText: "  " },
            ],
          }),
        ),
      "빈칸 키는 50자 이하여야 합니다.",
    );
  });
  it("rejects duplicate blank keys", () => {
    expectMessage(
      () =>
        validateProblem(
          fb({
            content: "{{b1}} {{b1}}",
            blanks: [
              { blankKey: "b1", answerText: "가" },
              { blankKey: "b1", answerText: "나" },
            ],
            blankRevealCount: 1,
          }),
        ),
      "빈칸 키가 중복되었습니다.",
    );
  });
  it("rejects a declared key missing from the content", () => {
    expectMessage(
      () => validateProblem(fb({ blanks: [{ blankKey: "b9", answerText: "가" }] })),
      "본문에 없는 빈칸 마커입니다: b9",
    );
  });
  it("rejects an orphan marker in the content", () => {
    // {{b7}} with no matching answer would leak to learners raw and can't be graded.
    expectMessage(
      () => validateProblem(fb({ content: "{{b1}} 그리고 {{b7}}" })),
      "정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: b7",
    );
  });
  it("rejects a reveal count greater than the number of blanks", () => {
    expectMessage(() => validateProblem(fb({ blankRevealCount: 2 })), "출제할 빈칸 개수가 유효하지 않습니다.");
  });
  it("rejects a reveal count of 0", () => {
    expectMessage(() => validateProblem(fb({ blankRevealCount: 0 })), "출제할 빈칸 개수가 유효하지 않습니다.");
  });

  it("accepts a blank key outside the marker regex charset when it is a literal substring of the content (A2)", () => {
    // Java's forward check is content.contains("{{" + key + "}}") — a literal substring test
    // (ProblemServiceImpl.java:425-429), not the [A-Za-z0-9_-]+ regex. A Korean key like "빈칸1"
    // is outside that charset but must still pass, exactly as it does in Spring.
    expect(() =>
      validateProblem(fb({ content: "수도는 {{빈칸1}}이다", blanks: [{ blankKey: "빈칸1", answerText: "서울" }] })),
    ).not.toThrow();
  });

  it("accepts a blank key containing '.' when it is a literal substring of the content (A2)", () => {
    expect(() =>
      validateProblem(fb({ content: "a {{b.1}} c", blanks: [{ blankKey: "b.1", answerText: "x" }] })),
    ).not.toThrow();
  });
});

describe("validateSourceNumber", () => {
  it("rejects a missing source number", () => {
    expectMessage(() => validateSourceNumber(null), "문항 번호를 입력하세요.");
  });
  it("rejects 0", () => {
    expectMessage(() => validateSourceNumber(0), "문항 번호는 1 이상이어야 합니다.");
  });
  it("rejects a negative number", () => {
    expectMessage(() => validateSourceNumber(-3), "문항 번호는 1 이상이어야 합니다.");
  });
  it("passes 1", () => {
    expect(() => validateSourceNumber(1)).not.toThrow();
  });
});

describe("normalizeTags", () => {
  it("trims, lowercases, and dedupes", () => {
    expect(normalizeTags([" 회계 ", "회계", "ABC"])).toEqual(["회계", "abc"]);
  });
  it("rejects 21 tags", () => {
    expectMessage(
      () => normalizeTags(Array.from({ length: 21 }, (_, i) => `t${i}`)),
      "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.",
    );
  });
  it("rejects a 101-character tag", () => {
    expectMessage(() => normalizeTags(["a".repeat(101)]), "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.");
  });
});

describe("normalizeProblemRequest", () => {
  it("turns whitespace-only values into null and trims the rest, without mutating the input", () => {
    // Leftover padding in stored values flips short-answer grading.
    const input: ProblemCreateInput = {
      ...base,
      content: "  본문  ",
      imageUrl: "  " + IMAGE_URL_PREFIX + "x.png  ",
      referenceText: "  참조  ",
      explanation: "   ",
      choices: [{ text: "  가  ", correct: true }],
      answers: ["  서울  "],
      blanks: [{ blankKey: "  b1  ", answerText: "  서울  " }],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = normalizeProblemRequest(input);
    expect(out.content).toBe("본문");
    expect(out.imageUrl).toBe(IMAGE_URL_PREFIX + "x.png");
    expect(out.referenceText).toBe("참조");
    expect(out.explanation).toBeNull();
    expect(out.choices).toEqual([{ text: "가", correct: true }]);
    expect(out.answers).toEqual(["서울"]);
    expect(out.blanks).toEqual([{ blankKey: "b1", answerText: "서울" }]);
    expect(input).toEqual(snapshot);
  });

  it("falls through to the type message for a type outside the five (switch default net)", () => {
    // Java 는 enum 이라 닿을 수 없는 분기다. TS 는 캐스팅 한 번이면 닿는데, default 가 없으면
    // 유형별 검사를 하나도 돌리지 않은 채 통과해 DB 의 CHECK 제약에서 -1 로 터진다.
    const input = { type: "MCQ" as never, content: "본문", choices: [] };
    expectMessage(() => validateProblem(input), "문제 유형을 선택하세요.");
  });

  it("does not touch tags — normalizeTags runs only at save time in Java, after validate/validateSourceNumber (A1)", () => {
    // Java's normalize() (ProblemServiceImpl.java:230-249) never calls normalizeTags; it is
    // called at save time only (:124,:162), after validate() and validateSourceNumber(). If
    // normalizeProblemRequest normalized tags, a request with 21 tags AND a missing type would
    // report the tag-count message instead of Java's "문제 유형을 선택하세요." because tag
    // normalization would throw first, before validateProblem ever runs.
    const manyTags = Array.from({ length: 21 }, (_, i) => `t${i}`);
    const input: ProblemCreateInput = { type: null as never, content: null as never, tags: manyTags };
    expect(() => normalizeProblemRequest(input)).not.toThrow();
    const normalized = normalizeProblemRequest(input);
    expect(normalized.tags).toEqual(manyTags);
    expectMessage(() => validateProblem(normalized), "문제 유형을 선택하세요.");
  });
});
