import { useEffect } from "react";
import { ensureSessionFetched, useSessionStore } from "@/store/sessionStore.js";

/**
 * 전역 세션 스토어(zustand)를 구독하는 얇은 훅.
 * 마운트 시 ensureSessionFetched()를 호출하지만, 실제 fetch는 스토어 상태가
 * "loading"이고 진행 중인 요청이 없을 때 한 번만 발생한다
 * (여러 컴포넌트가 동시에 이 훅을 사용해도 세션 조회는 중복되지 않는다).
 *
 * 로그인/로그아웃 이후 스토어를 갱신하려면 이 훅이 아니라
 * `@/store/sessionStore.js`의 `refetchSession()`을 호출한다.
 *
 * @returns {{ status: "loading" | "authenticated" | "unauthenticated", session: object | null }}
 */
export function useSessionStatus() {
  const status = useSessionStore((state) => state.status);
  const session = useSessionStore((state) => state.session);

  useEffect(() => {
    ensureSessionFetched();
  }, []);

  return { status, session };
}
