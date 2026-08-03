import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  resolveErrorMessage,
  apiGet,
  apiPost,
  setOnSessionExpired,
  setOnPasswordChangeRequired,
} from "./client.js";

test("ApiError carries resultCode and message", () => {
  const error = new ApiError(1011, "사번 또는 비밀번호가 올바르지 않습니다.");
  assert.equal(error.resultCode, 1011);
  assert.equal(error.message, "사번 또는 비밀번호가 올바르지 않습니다.");
});

test("resolveErrorMessage returns ApiError message", () => {
  const error = new ApiError(1011, "사번 또는 비밀번호가 올바르지 않습니다.");
  assert.equal(resolveErrorMessage(error, "fallback"), "사번 또는 비밀번호가 올바르지 않습니다.");
});

test("resolveErrorMessage falls back for non-ApiError", () => {
  assert.equal(resolveErrorMessage(new Error("boom"), "fallback"), "fallback");
});

// --- Additional coverage beyond the brief's Step 1 tests ---
// The brief's three tests above only exercise ApiError/resolveErrorMessage as
// pure functions; none of them call request()/apiGet/apiPost against a mocked
// fetch. That leaves the most defect-prone behavior unpinned: a backend
// response that is HTTP 200 at the transport level but carries resultCode
// 1012 (PASSWORD_CHANGE_REQUIRED) in the JSON envelope. A naive client that
// branches on response.ok / response.status would treat this as success and
// silently swallow the signal setOnPasswordChangeRequired exists to catch.
// These tests stub globalThis.fetch to pin that behavior, plus the sibling
// 980 (session expired) case and the credentials/body-shape contract.

function stubFetch(responseBody, { status = 200 } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => responseBody,
    };
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("apiGet sends credentials: 'include' and resolves to data on resultCode 200", async () => {
  const { calls, restore } = stubFetch({
    resultCode: 200,
    resultMsg: "정상 처리되었습니다.",
    data: { ok: true },
  });
  try {
    const data = await apiGet("/api/auth/session");
    assert.deepEqual(data, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.credentials, "include");
  } finally {
    restore();
  }
});

test("HTTP 200 with resultCode 1012 still rejects and notifies the password-change-required listener", async () => {
  let notified = false;
  setOnPasswordChangeRequired(() => {
    notified = true;
  });
  const { restore } = stubFetch(
    { resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." },
    { status: 200 },
  );
  try {
    await assert.rejects(
      () => apiGet("/api/auth/session"),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.resultCode, 1012);
        return true;
      },
    );
    assert.equal(notified, true);
  } finally {
    restore();
    setOnPasswordChangeRequired(null);
  }
});

test("resultCode 980 notifies the session-expired listener and rejects", async () => {
  let notified = false;
  setOnSessionExpired(() => {
    notified = true;
  });
  const { restore } = stubFetch(
    { resultCode: 980, resultMsg: "세션이 만료되었습니다." },
    { status: 401 },
  );
  try {
    await assert.rejects(() => apiGet("/api/protected"));
    assert.equal(notified, true);
  } finally {
    restore();
    setOnSessionExpired(null);
  }
});

test("apiPost sends a JSON-serialized body with a Content-Type header", async () => {
  const { calls, restore } = stubFetch({ resultCode: 200, resultMsg: "ok", data: null });
  try {
    await apiPost("/api/auth/login", { employeeNo: "1234", password: "pw" });
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.body, JSON.stringify({ employeeNo: "1234", password: "pw" }));
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  } finally {
    restore();
  }
});
