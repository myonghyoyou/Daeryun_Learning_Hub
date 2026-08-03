import { useEffect } from "react";
import { useSessionStore } from "@/store/sessionStore.js";

/**
 * 전역 세션 스토어(zustand)를 구독하는 얇은 훅.
 * 마운트 시 스토어의 ensureSessionFetched()를 호출하지만, 실제 fetch는
 * 스토어 상태가 "loading"이고 진행 중인 요청이 없을 때 한 번만 발생한다
 * (여러 컴포넌트가 동시에 이 훅을 사용해도 세션 조회는 중복되지 않는다).
 *
 * @returns {{ status: "loading" | "authenticated" | "unauthenticated", session: object | null }}
 */
export function useSessionStatus() {
  const status = useSessionStore((state) => state.status);
  const session = useSessionStore((state) => state.session);
  const ensureSessionFetched = useSessionStore((state) => state.ensureSessionFetched);

  useEffect(() => {
    ensureSessionFetched();
  }, [ensureSessionFetched]);

  return { status, session };
}
