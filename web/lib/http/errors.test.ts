import { describe, it, expect } from "vitest";
import { ZodError, z } from "zod";
import { ErrorCode } from "./errorCode";
import { ok, okMessage } from "./envelope";
import { BizError, bizStatus, handleRoute } from "./errors";

describe("envelope", () => {
  it("ok wraps data with the fixed success message", () => {
    expect(ok({ id: 1 })).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { id: 1 } });
  });
  it("ok omits data when undefined (NON_NULL)", () => {
    expect(ok()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다." });
  });
  it("okMessage carries code and message only", () => {
    expect(okMessage(1012, "비밀번호 변경이 필요합니다.")).toEqual({ resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." });
  });
});

describe("bizStatus", () => {
  it("maps EMPTY_SESSION to 401, ACCESS_AUTH_DENIED to 403, else 400", () => {
    expect(bizStatus(ErrorCode.EMPTY_SESSION)).toBe(401);
    expect(bizStatus(ErrorCode.ACCESS_AUTH_DENIED)).toBe(403);
    expect(bizStatus(ErrorCode.INPUT_VALUE_INVALID)).toBe(400);
  });
});

describe("handleRoute", () => {
  it("returns 200 + ok(data) on success", async () => {
    const res = await handleRoute(async () => ({ hello: "world" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { hello: "world" } });
  });

  it("maps BizError to its status and envelope", async () => {
    const res = await handleRoute(async () => {
      throw new BizError(ErrorCode.EMPTY_SESSION);
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ resultCode: 980, resultMsg: "세션 정보가 없습니다." });
  });

  it("maps a custom BizError message", async () => {
    const res = await handleRoute(async () => {
      throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않거나 보관된 문제입니다.");
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "존재하지 않거나 보관된 문제입니다." });
  });

  it("maps ZodError to HTTP 200 + errorList (field validation)", async () => {
    const res = await handleRoute(async () => {
      z.object({ name: z.string() }).parse({ name: 123 });
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultCode).toBe(1000);
    expect(body.resultMsg).toBe("잘못된 파라미터를 입력했습니다.");
    expect(Array.isArray(body.errorList)).toBe(true);
    expect(body.errorList[0].field).toBe("name");
  });

  it("maps an unexpected error to HTTP 200 + MSG_PROC_FAIL", async () => {
    const res = await handleRoute(async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: -1, resultMsg: "처리 중 오류가 발생하였습니다." });
  });
});
