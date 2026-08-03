import { create } from "zustand";
import { getSession } from "@/api/auth.js";

/**
 * 세션 상태를 앱 전역에서 공유하는 zustand 스토어.
 *
 * PrivateRoute/PublicRoute(및 이후 Task의 AdminRoute/Landing 등)처럼
 * useSessionStatus를 동시에 여러 인스턴스에서 사용하더라도
 * GET /api/auth/session 요청이 한 번만 발생하도록 fetch를 중복 제거한다.
 * (plan 승인된 수정사항: "useSessionStatus 인스턴스별로 중복 조회하지 않도록
 * 전역 세션 스토어 또는 상위 라우트 상태를 공유한다")
 */
export const useSessionStore = create((set, get) => ({
  status: "loading",
  session: null,
  fetchPromise: null,

  ensureSessionFetched() {
    const { status, fetchPromise } = get();
    if (fetchPromise) return fetchPromise;
    if (status !== "loading") return Promise.resolve();

    const promise = getSession()
      .then((session) => {
        set({
          status: session?.isLoggedIn ? "authenticated" : "unauthenticated",
          session: session ?? null,
        });
      })
      .catch(() => {
        set({ status: "unauthenticated", session: null });
      })
      .finally(() => {
        set({ fetchPromise: null });
      });

    set({ fetchPromise: promise });
    return promise;
  },
}));
