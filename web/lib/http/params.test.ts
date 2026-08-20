import { describe, it, expect } from "vitest";
import { parseDateParam, parseNumericParam } from "./params";
import { BizError } from "./errors";

describe("parseNumericParam", () => {
  it("returns null for null/undefined/empty string", () => {
    expect(parseNumericParam(null, "id")).toBeNull();
    expect(parseNumericParam(undefined, "id")).toBeNull();
    expect(parseNumericParam("", "id")).toBeNull();
  });

  it("parses a plain integer string", () => {
    expect(parseNumericParam("3", "id")).toBe(3);
  });

  it.each(["abc", "1.5", "1e20"])("throws a BizError for non-integer value %s", (value) => {
    let thrown: unknown;
    try {
      parseNumericParam(value, "id");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BizError);
    expect((thrown as BizError).message).toBe("요청 값의 형식이 올바르지 않습니다: id");
    expect((thrown as BizError).errorCode.code).toBe(1000);
  });
});

describe("parseDateParam", () => {
  it("returns null for null/undefined/empty string", () => {
    expect(parseDateParam(null, "createdFrom")).toBeNull();
    expect(parseDateParam(undefined, "createdFrom")).toBeNull();
    expect(parseDateParam("", "createdFrom")).toBeNull();
  });

  it("parses an ISO yyyy-MM-dd date at UTC midnight", () => {
    const parsed = parseDateParam("2026-08-19", "createdFrom")!;
    expect(parsed.toISOString()).toBe("2026-08-19T00:00:00.000Z");
  });

  // Spring: @DateTimeFormat(ISO.DATE) 미충족 → MethodArgumentTypeMismatchException →
  // 400 + 1000 + "요청 값의 형식이 올바르지 않습니다: <이름>". 애너테이션이 없던 시절에는
  // 목록 조회 전체가 500 으로 죽었다(QA D1) — 그 재발을 막는 테스트다.
  it.each(["어제", "2026/08/19", "20260819", "2026-8-19", "2026-08-19T00:00:00"])(
    "throws a BizError for a non-ISO date %s", (value) => {
      let thrown: unknown;
      try {
        parseDateParam(value, "createdFrom");
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(BizError);
      expect((thrown as BizError).message).toBe("요청 값의 형식이 올바르지 않습니다: createdFrom");
      expect((thrown as BizError).errorCode.code).toBe(1000);
    },
  );

  // 형식은 맞지만 존재하지 않는 날짜. Date.UTC 는 조용히 3월 2일로 굴러가므로 되짚어 확인한다.
  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-04-31"])(
    "throws a BizError for the impossible date %s", (value) => {
      expect(() => parseDateParam(value, "createdTo")).toThrowError(
        expect.objectContaining({ message: "요청 값의 형식이 올바르지 않습니다: createdTo" }));
    },
  );

  it("accepts a real leap day", () => {
    expect(parseDateParam("2024-02-29", "createdTo")!.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });
});
