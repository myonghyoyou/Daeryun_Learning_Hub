import { describe, it, expect } from "vitest";
import { assertConfirmedCount, buildBackup, readFlagValue } from "./proofTarget";
import type { CellChange } from "./applyProofSheet";

describe("assertConfirmedCount — 운영 반영 전 건수 확인", () => {
  it("건수를 안 적으면 무엇을 적어야 하는지 알려주며 막는다", () => {
    expect(() => assertConfirmedCount(undefined, 54)).toThrow(/--confirm 54/);
  });

  it("숫자가 아니면 막는다", () => {
    expect(() => assertConfirmedCount("쉰넷", 54)).toThrow(/숫자/);
  });

  it("건수가 다르면 막는다 — 엑셀이 바뀐 걸 모르고 반영하는 사고를 잡는다", () => {
    expect(() => assertConfirmedCount("50", 54)).toThrow(/50.*54|54.*50/);
  });

  it("건수가 정확히 같아야 통과한다", () => {
    expect(() => assertConfirmedCount("54", 54)).not.toThrow();
  });

  it("0 건도 정확히 적으면 통과한다 — 0 을 빈 값으로 오해하지 않는다", () => {
    expect(() => assertConfirmedCount("0", 0)).not.toThrow();
  });
});

describe("readFlagValue", () => {
  it("--confirm 54 형태를 읽는다", () => {
    expect(readFlagValue(["--prod", "--confirm", "54"], "--confirm")).toBe("54");
  });

  it("--confirm=54 형태도 읽는다", () => {
    expect(readFlagValue(["--prod", "--confirm=54"], "--confirm")).toBe("54");
  });

  it("값 없이 다음 플래그가 오면 못 읽은 것으로 본다", () => {
    expect(readFlagValue(["--confirm", "--prod"], "--confirm")).toBeUndefined();
  });

  it("플래그가 아예 없으면 undefined 다", () => {
    expect(readFlagValue(["--prod"], "--confirm")).toBeUndefined();
  });

  it("파일 경로처럼 값에 슬래시가 있어도 읽는다", () => {
    expect(readFlagValue(["--file", ".data/backup.json"], "--file")).toBe(".data/backup.json");
  });
});

describe("buildBackup", () => {
  it("되돌리는 데 필요한 값을 그대로 담는다", () => {
    const change: CellChange = {
      problemId: 1, sheet: "공통", column: "content", table: "problems",
      rowId: 1, field: "content", before: "옛 글", after: "새 글",
    };
    const backup = buildBackup("prod", "prod.example.com", [change]);
    expect(backup.target).toBe("prod");
    expect(backup.host).toBe("prod.example.com");
    expect(backup.changes).toEqual([change]);
    expect(typeof backup.savedAt).toBe("string");
  });
});
