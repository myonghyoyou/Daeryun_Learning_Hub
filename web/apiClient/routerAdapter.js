/**
 * web/app/providers.tsx 의 Next.js useRouter() 를 registerSessionRedirects() 가
 * 기대하는 { navigate, state } 어댑터 모양으로 감싼다.
 *
 * state 를 getter 로 두는 이유: sessionRedirects.js 의 currentPathname(router) 는
 * "이미 목적지면 이동하지 않는다" 판정을 위해 호출될 때마다 현재 경로를 다시
 * 읽어야 한다. 값을 한 번 캡처해 두면 등록 시점(첫 마운트)의 경로가 세션 내내
 * 박제돼 그 판정이 항상 잘못된다.
 *
 * getPathname 을 주입 가능하게 둔 이유: 이 함수 자체는 providers.tsx 밖으로 뽑혀
 * 나온 순수 함수라 DOM 없이도 테스트할 수 있어야 한다. 기본값은 실제 브라우저의
 * window.location.pathname 을 읽지만, 테스트에서는 가짜 경로를 반환하는 함수를
 * 넣어 getter 가 매 호출마다 새로 읽는지 검증한다.
 */
export function createRouterAdapter(router, { getPathname = () => window.location.pathname } = {}) {
  return {
    navigate: (to, opts) => (opts?.replace ? router.replace(to) : router.push(to)),
    get state() {
      return { location: { pathname: getPathname() } };
    },
  };
}
