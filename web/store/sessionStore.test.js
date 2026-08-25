import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore, markSessionExpired, refetchSession } from "./sessionStore.js";

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
