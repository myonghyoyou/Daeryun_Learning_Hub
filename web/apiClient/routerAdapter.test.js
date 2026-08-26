import { test } from "vitest";
import assert from "node:assert/strict";
import { createRouterAdapter } from "./routerAdapter.js";

// createRouterAdapter 는 web/app/providers.tsx 가 만들던 라우터 어댑터를 그대로 뽑아낸
// 순수 함수다. providers.tsx 는 "use client" + useRouter() 때문에 이 저장소의 vitest
// (environment: "node", DOM 없음) 로는 직접 테스트할 수 없어서, 실제 어댑터 로직이
// 이 파일에 살며 여기서 실제 동작으로 검증된다.

test("state.location.pathname 은 접근할 때마다 다시 읽는다 — 한 번 캡처해 고정되지 않는다", () => {
  let pathname = "/solve";
  const adapter = createRouterAdapter(
    { push: () => {}, replace: () => {} },
    { getPathname: () => pathname },
  );

  assert.equal(adapter.state.location.pathname, "/solve");

  pathname = "/login";
  assert.equal(
    adapter.state.location.pathname,
    "/login",
    "state 를 값으로 한 번 캡처했다면 두 번째 읽기도 여전히 /solve 를 돌려줬을 것이다",
  );
});

test("navigate(to) 는 옵션이 없으면 router.push 를 호출한다", () => {
  const calls = [];
  const router = {
    push: (to) => calls.push(["push", to]),
    replace: (to) => calls.push(["replace", to]),
  };
  const adapter = createRouterAdapter(router, { getPathname: () => "/" });

  adapter.navigate("/change-password");

  assert.deepEqual(calls, [["push", "/change-password"]]);
});

test("navigate(to, { replace: true }) 는 router.replace 를 호출한다", () => {
  const calls = [];
  const router = {
    push: (to) => calls.push(["push", to]),
    replace: (to) => calls.push(["replace", to]),
  };
  const adapter = createRouterAdapter(router, { getPathname: () => "/" });

  adapter.navigate("/login?reason=session-expired", { replace: true });

  assert.deepEqual(calls, [["replace", "/login?reason=session-expired"]]);
});

test("getPathname 을 생략하면 기본값이 window.location.pathname 을 읽는다", () => {
  // 이 테스트 환경엔 DOM 이 없으므로, window 를 최소한으로 스텁해 기본 매개변수
  // 경로가 실제로 그 값을 읽어 쓰는지만 확인하고 끝나면 원상복구한다.
  const original = globalThis.window;
  globalThis.window = { location: { pathname: "/stubbed" } };
  try {
    const adapter = createRouterAdapter({ push: () => {}, replace: () => {} });
    assert.equal(adapter.state.location.pathname, "/stubbed");
  } finally {
    if (original === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = original;
    }
  }
});
