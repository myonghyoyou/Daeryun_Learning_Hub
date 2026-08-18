import { describe, it, expect } from "vitest";
import { parseNumericParam } from "./params";
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
