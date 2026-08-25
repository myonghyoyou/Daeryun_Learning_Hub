/**
 * API 클라이언트(@/api/client.js)가 감지하는 세션 이벤트를 실제 라우팅으로 연결한다.
 *
 * client.js 는 resultCode 980(세션 만료)/1012(비밀번호 변경 필요)를 만나면
 * 등록된 리스너를 호출하지만, Task 15 까지 그 리스너를 등록하는 곳이 아무 데도
 * 없어서 두 흐름이 통째로 죽어 있었다. 그 결과
 *   - 90분 유휴 만료 후 모든 호출이 980 을 돌려주는데도 사용자는 깨진 화면에
 *     그대로 머물고 /login 으로 돌아가지 못했다(LoginPage 의
 *     `?reason=session-expired` 배너도 도달 불가능한 죽은 코드였다).
 *   - 비밀번호 강제 변경 게이트에 클라이언트 측 강제가 전혀 없었다.
 *
 * 이 리스너들은 React 라우터 컨텍스트 밖(API 클라이언트 내부)에서 호출되므로
 * useNavigate 를 쓸 수 없다. createBrowserRouter 가 노출하는 router.navigate 를
 * 사용해 클라이언트 라우팅과 세션 스토어를 유지한 채 이동한다
 * (window.location 은 전체 새로고침을 일으켜 스토어를 날린다).
 *
 * import 를 상대 경로로 쓰는 이유: 이 모듈은 `node --test` 에서 직접 테스트하는데,
 * 테스트 러너에는 Vite 의 "@/" alias 해석기가 없다. client.js 는 자체 import 가
 * 없어 Node 에서 그대로 로드된다.
 */
import { setOnSessionExpired, setOnPasswordChangeRequired } from "./client.js";

export const LOGIN_PATH = "/login";
export const SESSION_EXPIRED_PATH = "/login?reason=session-expired";
export const CHANGE_PASSWORD_PATH = "/change-password";

function currentPathname(router) {
  return router?.state?.location?.pathname ?? "";
}

/**
 * 세션 이벤트 리스너를 라우터에 등록한다. 모듈 최상위(main.jsx)에서 한 번만
 * 호출하므로 React 19 StrictMode 의 이중 effect 와 무관하다. 리스너 setter 는
 * 단순 대입이라 재등록도 안전하지만, 이미 목적지에 있는 경우에는 중복 이동을
 * 하지 않도록 경로를 먼저 확인한다.
 *
 * @param {object} params
 * @param {{ navigate: Function, state: object }} params.router createBrowserRouter 결과
 * @param {Function} [params.markSessionExpired] 세션 스토어를 미인증으로 되돌리는 액션.
 *   이걸 호출하지 않으면 스토어에 남은 "authenticated" 때문에 PublicRoute 가
 *   /login 진입을 다시 "/" 로 되돌려 보내 만료 안내가 영영 뜨지 않는다.
 */
export function registerSessionRedirects({ router, markSessionExpired }) {
  setOnSessionExpired(() => {
    markSessionExpired?.();
    if (currentPathname(router) === LOGIN_PATH) {
      return;
    }
    router.navigate(SESSION_EXPIRED_PATH, { replace: true });
  });

  setOnPasswordChangeRequired(() => {
    if (currentPathname(router) === CHANGE_PASSWORD_PATH) {
      return;
    }
    router.navigate(CHANGE_PASSWORD_PATH, { replace: true });
  });
}
