import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore, markSessionExpired, refetchSession, ensureSessionFetched } from "./sessionStore.js";

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeSessionResponse(data) {
  return {
    status: 200,
    ok: true,
    json: async () => ({ resultCode: 200, resultMsg: "ok", data }),
  };
}

/**
 * Task 7 회귀: ProtectedLayout(resolvePrivateRedirect, 하드코딩된 "/login")과
 * Providers(registerSessionRedirects, "/login?reason=session-expired")가
 * 세션 만료 시 독립적으로 router.replace()를 호출하는 경합에서, 쿼리 파라미터가
 * 유실돼도 LoginPage가 스토어의 expired 플래그를 보고 배너를 띄울 수 있어야 한다.
 */
describe("sessionStore expired flag", () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: "loading",
      session: null,
      fetchPromise: null,
      generation: 0,
      expired: false,
    });
  });

  it("markSessionExpired()는 expired를 true로 세운다", () => {
    markSessionExpired();
    expect(useSessionStore.getState().expired).toBe(true);
  });

  it("refetchSession()은 expired를 false로 되돌린다(재로그인 뒤 배너가 남지 않도록)", () => {
    markSessionExpired();
    expect(useSessionStore.getState().expired).toBe(true);

    // applySessionFetch가 실제 네트워크 요청을 시도하지만, 내부에서 자체
    // catch로 처리되므로 여기서는 기다리지 않고 동기적으로 세워진 상태만 본다.
    const promise = refetchSession();
    expect(useSessionStore.getState().expired).toBe(false);

    // 백그라운드 fetch 실패가 unhandled rejection으로 새지 않는지도 함께 확인한다.
    return promise;
  });

  it("markSessionExpired()는 status/session도 함께 미인증으로 되돌린다", () => {
    useSessionStore.setState({ status: "authenticated", session: { userId: 1 } });
    markSessionExpired();
    const state = useSessionStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.session).toBeNull();
    expect(state.expired).toBe(true);
  });
});

/**
 * G11 회귀: applySessionFetch가 generation을 비교해 stale 응답을 버리는지 직접 검증한다.
 * ensureSessionFetched()로 시작된 fetch(1세대)가 아직 응답을 받기 전에 refetchSession()이
 * 호출되면 generation이 2세대로 넘어가고 새 fetch가 시작된다. 이후 1세대 fetch가 뒤늦게
 * 응답해도(예: 네트워크 지연) 그 응답으로 스토어를 덮어써서는 안 된다 — 덮어쓴다면 이미
 * 최신인 2세대 응답을 오래된 1세대 응답이 되돌려버리는 경합이 생긴다.
 */
describe("sessionStore generation 기반 stale 응답 폐기", () => {
  let originalFetch;

  beforeEach(() => {
    useSessionStore.setState({
      status: "loading",
      session: null,
      fetchPromise: null,
      generation: 0,
      expired: false,
    });
    originalFetch = globalThis.fetch;
  });

  it("제너레이션이 바뀐 뒤 도착한 오래된 fetch 응답은 스토어를 덮어쓰지 않는다", async () => {
    const staleFetch = deferred();
    const freshFetch = deferred();
    const calls = [];
    globalThis.fetch = async () => {
      calls.push(calls.length);
      return calls.length === 1 ? staleFetch.promise : freshFetch.promise;
    };

    try {
      // 1세대 fetch 시작(아직 응답 없음)
      const staleResultPromise = ensureSessionFetched();
      expect(useSessionStore.getState().generation).toBe(0);

      // refetchSession()이 generation을 2세대로 올리고 새 fetch를 시작한다.
      const freshResultPromise = refetchSession();
      expect(useSessionStore.getState().generation).toBe(1);

      // 2세대(현재) fetch가 먼저 응답한다.
      freshFetch.resolve(fakeSessionResponse({ isLoggedIn: false }));
      await freshResultPromise;

      expect(useSessionStore.getState().status).toBe("unauthenticated");
      expect(useSessionStore.getState().session).toEqual({ isLoggedIn: false });

      // 1세대(stale) fetch가 뒤늦게 응답한다 — 구분 가능한 값으로 덮어쓰기 여부를 확인한다.
      staleFetch.resolve(fakeSessionResponse({ isLoggedIn: true, employeeNo: "STALE" }));
      await staleResultPromise;

      const state = useSessionStore.getState();
      expect(state.session?.employeeNo).not.toBe("STALE");
      expect(state.status).toBe("unauthenticated");
      expect(state.session).toEqual({ isLoggedIn: false });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
