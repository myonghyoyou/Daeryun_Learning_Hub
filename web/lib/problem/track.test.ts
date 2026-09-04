import { describe, it, expect } from "vitest";
import { DEFAULT_TRACK, parseTrack } from "./track";

describe("parseTrack", () => {
  it("아는 값은 그대로 돌려준다", () => {
    expect(parseTrack("ADMIN")).toBe("ADMIN");
    expect(parseTrack("TECH")).toBe("TECH");
  });

  // 잠금장치가 아니다 — 거절하지 않고 행정직으로 읽는다(스펙 "무엇이 아닌가").
  it("모르는 값·빈 값은 행정직으로 읽는다", () => {
    expect(parseTrack(null)).toBe(DEFAULT_TRACK);
    expect(parseTrack(undefined)).toBe(DEFAULT_TRACK);
    expect(parseTrack("")).toBe(DEFAULT_TRACK);
    expect(parseTrack("tech")).toBe(DEFAULT_TRACK); // 대소문자 관대하게 굴지 않는다
    expect(parseTrack(3)).toBe(DEFAULT_TRACK);
  });

  it("기본값은 행정직이다", () => {
    expect(DEFAULT_TRACK).toBe("ADMIN");
  });
});
