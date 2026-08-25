import { create } from "zustand";
import { getSession } from "@/apiClient/auth.js";

/**
 * 세션 상태를 앱 전역에서 공유하는 zustand 스토어.
 *
 * PrivateRoute/PublicRoute(및 이후 Task의 AdminRoute/Landing 등)처럼
 * useSessionStatus를 동시에 여러 인스턴스에서 사용하더라도
 * GET /api/auth/session 요청이 한 번만 발생하도록 fetch를 중복 제거한다.
 * (plan 승인된 수정사항: "useSessionStatus 인스턴스별로 중복 조회하지 않도록
 * 전역 세션 스토어 또는 상위 라우트 상태를 공유한다")
 *
 * `generation`은 무효화(refetchSession) 시점을 표시하는 단조 증가 카운터다.
 * 무효화가 진행 중인 fetch보다 먼저(혹은 도중에) 일어나면, 그 이전 세대의
 * fetch가 나중에 응답을 받더라도 이미 새로운 세대로 넘어간 상태를 되돌려
 * 덮어쓰지 않도록 응답 적용 전에 generation을 비교해 stale 응답을 버린다.
 */
export const useSessionStore = create(() => ({
  status: "loading",
  session: null,
  fetchPromise: null,
  generation: 0,
  // Task 7: ProtectedLayout(resolvePrivateRedirect, "/login" 고정)과
  // Providers(registerSessionRedirects, "/login?reason=session-expired")가
  // 세션 만료 시 서로 다른 목적지로 동시에 router.replace()를 호출하는 경합이 있다.
  // 어느 쪽이 마지막에 이기든 URL 파라미터가 유실될 수 있으므로, 파라미터에
  // 의존하지 않는 별도 신호를 스토어에 남겨 LoginPage가 둘 중 하나만 봐도
  // 배너를 띄우게 한다.
  expired: false,
}));

function applySessionFetch(generation) {
  const promise = getSession()
    .then((session) => {
      // 이 fetch가 시작된 뒤 refetchSession()으로 무효화되어 새 세대가
      // 시작됐다면, 이 응답은 stale이므로 상태에 반영하지 않는다.
      if (useSessionStore.getState().generation !== generation) return;
      useSessionStore.setState({
        status: session?.isLoggedIn ? "authenticated" : "unauthenticated",
        session: session ?? null,
        fetchPromise: null,
      });
    })
    .catch(() => {
      if (useSessionStore.getState().generation !== generation) return;
      useSessionStore.setState({ status: "unauthenticated", session: null, fetchPromise: null });
    });

  useSessionStore.setState({ fetchPromise: promise });
  return promise;
}

/**
 * 스토어 상태가 "loading"이고 진행 중인 요청이 없을 때만 GET /api/auth/session을
 * 호출한다. useSessionStatus가 마운트 시 호출하며, 여러 컴포넌트 인스턴스가
 * 동시에 호출해도(React 19 단일 패스 effect flush, StrictMode의
 * mount→unmount→remount 포함) fetch는 한 번만 발생한다: fetchPromise는
 * getSession() 호출 직후, 어떤 await 경계도 거치지 않고 동기적으로
 * 스토어에 기록되므로, 뒤이은 동기 호출은 이미 채워진 fetchPromise를 보고
 * 그대로 재사용한다.
 */
export function ensureSessionFetched() {
  const { status, fetchPromise, generation } = useSessionStore.getState();
  if (fetchPromise) return fetchPromise;
  if (status !== "loading") return Promise.resolve();
  return applySessionFetch(generation);
}

/**
 * 로그인/로그아웃처럼 서버 세션이 바뀐 직후, 캐시된 스토어 상태를 무효화하고
 * 즉시 새로 조회한다. status를 "loading"으로 되돌리고 이전 session을 지운 뒤
 * generation을 증가시켜 새 GET /api/auth/session 요청을 시작한다.
 *
 * 이 액션이 없으면(=이 fix 이전 상태) 한 번 "authenticated"/"unauthenticated"로
 * 정착된 스토어는 페이지 전체를 새로고침하기 전까지 절대 재조회되지 않는다.
 * 로그인 성공 후 navigate("/", {replace:true})처럼 클라이언트 라우팅만으로
 * 이동하면 PrivateRoute가 로그인 이전의 캐시된 "unauthenticated"를 그대로
 * 읽어 즉시 /login으로 튕겨내고, 로그아웃 후에는 반대로 캐시된
 * "authenticated"가 남아 가드가 전혀 반응하지 않는다. 이 함수는 Task 14의
 * login()/logout() 성공 콜백에서 호출되어야 한다.
 *
 * 동시성: 무효화 시점에 이미 진행 중이던 이전 fetch가 이후에 응답을
 * 받더라도, generation이 무효화로 인해 이미 증가했기 때문에
 * applySessionFetch 내부의 generation 비교에서 걸러져 상태를 덮어쓰지 않는다.
 */
/**
 * 서버가 세션 만료(resultCode 980)를 알려왔을 때, 네트워크 왕복 없이 스토어를
 * 즉시 미인증 상태로 되돌린다.
 *
 * 이 액션이 없으면 만료 후 /login 으로 보내도 스토어에 남은 "authenticated" 를
 * PublicRoute 가 읽어 곧바로 "/" 로 되돌려 보내므로, 만료 안내 배너가 뜨지 않고
 * 사용자가 로그인 화면에 머물지도 못한다.
 *
 * generation 을 올려 진행 중이던 이전 fetch 의 응답이 나중에 도착해
 * "authenticated" 로 되돌리는 것을 막는다.
 */
export function markSessionExpired() {
  useSessionStore.setState({
    status: "unauthenticated",
    session: null,
    fetchPromise: null,
    expired: true, // 파라미터가 유실돼도 배너가 뜨게 하는 근거
    generation: useSessionStore.getState().generation + 1,
  });
}

/**
 * 로그인 성공 직후 호출된다. expired를 여기서 되돌리지 않으면, 만료 후
 * 재로그인해도 다음에 /login으로 돌아왔을 때(예: 로그아웃) 이전 만료 배너가
 * 계속 남아 있는 것처럼 보일 수 있다.
 */
export function refetchSession() {
  const nextGeneration = useSessionStore.getState().generation + 1;
  useSessionStore.setState({
    status: "loading",
    session: null,
    fetchPromise: null,
    expired: false,
    generation: nextGeneration,
  });
  return applySessionFetch(nextGeneration);
}
