import { describe, it, expect } from "vitest";
import { evaluateGate, requireRole } from "./gate";
import { BizError } from "../http/errors";
import type { AuthUser } from "./types";

const employee: AuthUser = { userId: 1, employeeNo: "1001", name: "홍", role: "EMPLOYEE", departmentId: 10, mustChangePassword: false };
const mustChange: AuthUser = { ...employee, mustChangePassword: true };

describe("evaluateGate", () => {
  it("allows OPTIONS", () => {
    expect(evaluateGate("/api/problems", "OPTIONS", null).action).toBe("allow");
  });
  it("allows the public auth paths without a session", () => {
    expect(evaluateGate("/api/auth/login", "POST", null).action).toBe("allow");
    expect(evaluateGate("/api/auth/session", "GET", null).action).toBe("allow");
  });
  it("rejects a protected path without a session as 401 EMPTY_SESSION", () => {
    const d = evaluateGate("/api/problems", "GET", null);
    expect(d).toEqual({ action: "reject", status: 401, body: { resultCode: 980, resultMsg: "세션 정보가 없습니다." } });
  });
  it("allows a logged-in user on a protected path", () => {
    expect(evaluateGate("/api/problems", "GET", employee).action).toBe("allow");
  });
  it("blocks mustChangePassword on non-auth paths with 200 + 1012", () => {
    const d = evaluateGate("/api/problems", "GET", mustChange);
    expect(d).toEqual({ action: "reject", status: 200, body: { resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." } });
  });
  it("lets mustChangePassword reach the auth paths (to change it)", () => {
    expect(evaluateGate("/api/auth/change-password", "POST", mustChange).action).toBe("allow");
  });
});

describe("requireRole", () => {
  it("passes when the role matches", () => {
    expect(() => requireRole(employee, "EMPLOYEE", "DEPT_ADMIN")).not.toThrow();
  });
  it("throws ACCESS_AUTH_DENIED when it does not", () => {
    expect(() => requireRole(employee, "SUPER_ADMIN")).toThrow(BizError);
  });
});
