import { test } from "vitest";
import assert from "node:assert/strict";
import { apiGet } from "./client.js";
import {
  registerSessionRedirects,
  SESSION_EXPIRED_PATH,
  CHANGE_PASSWORD_PATH,
} from "./sessionRedirects.js";

// 이 테스트는 registerSessionRedirects 가 실제로 client.js 의 리스너 슬롯을 채우는지를,
// 순수 함수 호출이 아니라 "가짜 fetch 로 980/1012 응답을 흘려보내면 라우터가 이동하는가"로
// 확인한다. 등록 자체가 빠지면(= 이 수정 이전 상태) 아래 테스트들은 모두 실패한다.

function stubFetch(responseBody, { status = 200 } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => responseBody,
  });
  return () => {
    globalThis.fetch = original;
  };
}

function fakeRouter(pathname) {
  const navigations = [];
  return {
    navigations,
    state: { location: { pathname } },
    navigate: (to, options) => {
      navigations.push({ to, options });
    },
  };
}

test("resultCode 980 sends the user to /login?reason=session-expired", async () => {
  const router = fakeRouter("/solve");
  let marked = 0;
  registerSessionRedirects({ router, markSessionExpired: () => (marked += 1) });
  const restore = stubFetch({ resultCode: 980, resultMsg: "세션 정보가 없습니다." }, { status: 401 });
  try {
    await assert.rejects(() => apiGet("/api/problems"));

    assert.equal(marked, 1, "세션 스토어를 미인증으로 되돌리지 않으면 PublicRoute 가 다시 / 로 튕겨낸다");
    assert.deepEqual(router.navigations, [{ to: SESSION_EXPIRED_PATH, options: { replace: true } }]);
  } finally {
    restore();
  }
});

test("resultCode 980 while already on /login does not navigate again", async () => {
  const router = fakeRouter("/login");
  let marked = 0;
  registerSessionRedirects({ router, markSessionExpired: () => (marked += 1) });
  const restore = stubFetch({ resultCode: 980, resultMsg: "세션 정보가 없습니다." }, { status: 401 });
  try {
    await assert.rejects(() => apiGet("/api/auth/session"));

    assert.equal(marked, 1);
    assert.deepEqual(router.navigations, []);
  } finally {
    restore();
  }
});

test("resultCode 1012 sends the user to /change-password", async () => {
  const router = fakeRouter("/solve");
  registerSessionRedirects({ router, markSessionExpired: () => {} });
  const restore = stubFetch({ resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." });
  try {
    await assert.rejects(() => apiGet("/api/problems"));

    assert.deepEqual(router.navigations, [{ to: CHANGE_PASSWORD_PATH, options: { replace: true } }]);
  } finally {
    restore();
  }
});

test("resultCode 1012 while already on /change-password does not loop", async () => {
  const router = fakeRouter("/change-password");
  registerSessionRedirects({ router, markSessionExpired: () => {} });
  const restore = stubFetch({ resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." });
  try {
    await assert.rejects(() => apiGet("/api/problems"));

    assert.deepEqual(router.navigations, []);
  } finally {
    restore();
  }
});

test("a successful response triggers no navigation", async () => {
  const router = fakeRouter("/solve");
  registerSessionRedirects({ router, markSessionExpired: () => {} });
  const restore = stubFetch({ resultCode: 200, resultMsg: "ok", data: { ok: true } });
  try {
    await apiGet("/api/problems");
    assert.deepEqual(router.navigations, []);
  } finally {
    restore();
  }
});
