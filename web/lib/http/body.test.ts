import { describe, it, expect } from "vitest";
import { readJson, asStringField } from "./body";

describe("readJson", () => {
  it("parses a valid JSON body", async () => {
    const req = new Request("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "content-type": "application/json" },
    });
    expect(await readJson(req)).toEqual({ a: 1 });
  });

  it("returns {} for a malformed/empty body", async () => {
    const req = new Request("http://localhost/x", { method: "POST" });
    expect(await readJson(req)).toEqual({});
  });
});

describe("asStringField", () => {
  it("passes strings through unchanged", () => {
    expect(asStringField("abc")).toBe("abc");
  });

  it("coerces numbers to strings (Jackson parity)", () => {
    expect(asStringField(1001)).toBe("1001");
  });

  it("coerces booleans to strings (Jackson parity)", () => {
    expect(asStringField(true)).toBe("true");
    expect(asStringField(false)).toBe("false");
  });

  it("treats objects as absent", () => {
    expect(asStringField({ a: 1 })).toBeUndefined();
  });

  it("treats arrays as absent", () => {
    expect(asStringField([1, 2])).toBeUndefined();
  });

  it("treats null as absent", () => {
    expect(asStringField(null)).toBeUndefined();
  });

  it("treats undefined as absent", () => {
    expect(asStringField(undefined)).toBeUndefined();
  });
});
