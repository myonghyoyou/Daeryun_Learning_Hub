import { describe, it, expect } from "vitest";
import { sanity } from "./sanity";

describe("sanity", () => {
  it("returns ok", () => {
    expect(sanity()).toBe("ok");
  });
});
