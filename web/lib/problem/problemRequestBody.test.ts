import { describe, it, expect } from "vitest";
import { MessageNotReadableError } from "../http/errors";
import { toDepartmentChangeInput, toProblemCreateInput } from "./problemRequestBody";
import { normalizeTags, validateProblem } from "./problemValidation";

function expectUnreadable(body: Record<string, unknown>) {
  expect(() => toProblemCreateInput(body)).toThrowError(MessageNotReadableError);
}

const ox = {
  type: "OX", content: "본문", sourceNumber: 3,
  choices: [{ text: "O", correct: true }, { text: "X", correct: false }],
};

describe("toProblemCreateInput — 읽을 수 있는 본문", () => {
  it("maps every field of a well-formed body", () => {
    expect(toProblemCreateInput(ox)).toEqual({
      type: "OX", content: "본문", imageUrl: null, referenceText: null, explanation: null,
      choices: [{ text: "O", correct: true }, { text: "X", correct: false }],
      answers: null, blanks: null, blankRevealCount: null, tags: null, sourceNumber: 3,
    });
  });

  it("keeps a missing field null so the Korean validation message still wins", () => {
    // 본문 매핑이 "유형 누락"을 스스로 1000 으로 바꿔 버리면 "문제 유형을 선택하세요." 가 사라진다.
    const mapped = toProblemCreateInput({ content: "본문" });
    expect(mapped.type).toBeNull();
    expect(() => validateProblem(mapped)).toThrowError(
      expect.objectContaining({ message: "문제 유형을 선택하세요." }));
  });

  it("treats an empty string type as absent (Jackson CoercionAction.AsNull)", () => {
    expect(toProblemCreateInput({ type: "" }).type).toBeNull();
  });

  it("coerces scalars into strings the way Jackson does", () => {
    const mapped = toProblemCreateInput({ ...ox, content: 1001, referenceText: true });
    expect(mapped.content).toBe("1001");
    expect(mapped.referenceText).toBe("true");
  });

  it("accepts the Integer boundaries themselves", () => {
    expect(toProblemCreateInput({ ...ox, sourceNumber: 2147483647 }).sourceNumber).toBe(2147483647);
    expect(toProblemCreateInput({ ...ox, blankRevealCount: -2147483648 }).blankRevealCount).toBe(-2147483648);
  });

  it("keeps a null list element instead of asserting it away (Minor 1)", () => {
    // Java 의 normalizeTags 는 .map(String::trim) 이라 같은 입력에 NPE(-1)가 난다. 이식판은
    // null 을 건너뛰므로 결과가 낫고, 타입도 그 사실을 말해야 한다((string|null)[]).
    const mapped = toProblemCreateInput({ ...ox, tags: ["가", null], answers: [null] });
    expect(mapped.tags).toEqual(["가", null]);
    expect(mapped.answers).toEqual([null]);
    expect(normalizeTags(mapped.tags)).toEqual(["가"]);
  });

  it("coerces an integer string into a number and truncates a float", () => {
    expect(toProblemCreateInput({ ...ox, sourceNumber: "12" }).sourceNumber).toBe(12);
    expect(toProblemCreateInput({ ...ox, blankRevealCount: 2.9 }).blankRevealCount).toBe(2);
  });

  it("defaults a missing or null `correct` flag to false (Java primitive boolean)", () => {
    const mapped = toProblemCreateInput({ ...ox, choices: [{ text: "O" }, { text: "X", correct: null }] });
    expect(mapped.choices).toEqual([{ text: "O", correct: false }, { text: "X", correct: false }]);
  });

  it("ignores unknown properties (FAIL_ON_UNKNOWN_PROPERTIES is off in Spring Boot)", () => {
    expect(toProblemCreateInput({ ...ox, departmentId: 9, 낯선필드: 1 }).type).toBe("OX");
  });
});

describe("toProblemCreateInput — 읽을 수 없는 본문(Spring HttpMessageNotReadableException 미러)", () => {
  it("rejects an unrecognised type", () => {
    // Java 의 type 은 ProblemType enum 이라 "MCQ" 는 Jackson 이 먼저 거른다. 캐스팅만 하던
    // 시절에는 유형별 검사가 통째로 건너뛰어져 DB 까지 갔다(switch 에 default 분기가 없다).
    expectUnreadable({ ...ox, type: "MCQ" });
  });

  it("rejects a non-numeric sourceNumber", () => {
    expectUnreadable({ ...ox, sourceNumber: "abc" });
  });

  it.each([["문자열", "notanarray"], ["객체", { a: 1 }], ["숫자", 3]])(
    "rejects choices that are not an array (%s)", (_label, choices) => {
      // Jackson 의 ACCEPT_SINGLE_VALUE_AS_ARRAY 는 기본 off 다.
      expectUnreadable({ ...ox, choices });
    });

  it.each(["answers", "blanks", "tags"])("rejects %s that is not an array", (field) => {
    expectUnreadable({ ...ox, [field]: "하나" });
  });

  it("rejects a choice element that is not an object", () => {
    expectUnreadable({ ...ox, choices: ["O", "X"] });
  });

  it.each([
    // Critical: Java 의 필드는 Integer 다. 2^53 으로 재면 이 값이 통과해 컬럼(`integer`)에
    // 닿고 SQLSTATE 22003 → -1 로 나간다 — F1 이 닫으려던 바로 그 구멍이다. JSON 숫자로
    // 넣어야 이 갈래를 탄다(문자열 21자리는 정수 문자열 검사에서 먼저 걸린다).
    ["a JSON number sourceNumber over Integer.MAX_VALUE", { sourceNumber: 3000000000 }],
    ["a JSON number sourceNumber under Integer.MIN_VALUE", { sourceNumber: -3000000000 }],
    ["a numeric string over Integer.MAX_VALUE", { sourceNumber: "2147483648" }],
    ["a blankRevealCount over Integer.MAX_VALUE", { blankRevealCount: 4e9 }],
    ["object content", { content: { a: 1 } }],
    ["array content", { content: [1] }],
    ["boolean sourceNumber", { sourceNumber: true }],
    ["float string sourceNumber", { sourceNumber: "1.5" }],
    ["out-of-range sourceNumber", { sourceNumber: "999999999999999999999" }],
    ["numeric type", { type: 3 }],
    ["object blankRevealCount", { blankRevealCount: {} }],
    ["object tag element", { tags: [{ a: 1 }] }],
  ])("rejects %s", (_label, patch) => {
    expectUnreadable({ ...ox, ...patch });
  });
});

describe("toDepartmentChangeInput", () => {
  it("maps departmentId and leaves an absent one null for the service guard", () => {
    // 누락을 여기서 1000 으로 바꿔 버리면 "옮길 부서를 선택하세요."(정답지 C3)가 사라진다.
    expect(toDepartmentChangeInput({ departmentId: 7 })).toEqual({ departmentId: 7 });
    expect(toDepartmentChangeInput({})).toEqual({ departmentId: null });
    expect(toDepartmentChangeInput({ departmentId: null })).toEqual({ departmentId: null });
    expect(toDepartmentChangeInput({ departmentId: "" })).toEqual({ departmentId: null });
  });

  it("coerces a numeric string and truncates a float the way Jackson does", () => {
    expect(toDepartmentChangeInput({ departmentId: "12" }).departmentId).toBe(12);
    expect(toDepartmentChangeInput({ departmentId: 12.9 }).departmentId).toBe(12);
  });

  it("accepts ids beyond Integer.MAX_VALUE — the column is bigserial and the field is Long", () => {
    expect(toDepartmentChangeInput({ departmentId: 3000000000 }).departmentId).toBe(3000000000);
  });

  it.each([
    ["a non-numeric string", "abc"],
    ["a boolean", true],
    ["an object", { a: 1 }],
    ["an array", [1]],
    // 2^53 을 넘으면 number 가 값을 뭉갠다 — 조용히 다른 부서로 옮기느니 여기서 막는다.
    ["a value past the safe-integer boundary", "9007199254740993"],
  ])("rejects %s departmentId", (_label, departmentId) => {
    expect(() => toDepartmentChangeInput({ departmentId })).toThrowError(MessageNotReadableError);
  });
});
