import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { logout } from "@/api/auth.js";
import { refetchSession } from "@/store/sessionStore.js";
import { resolveErrorMessage } from "@/api/client.js";

/**
 * 로그아웃 동작을 화면들이 공유한다.
 *
 * 관리자 Shell(Topbar)뿐 아니라 학습 화면과 비밀번호 변경 화면에서도 로그아웃할 수 있어야 한다.
 * 그렇지 않으면 직원 계정으로 들어간 뒤 세션이 만료될 때까지 다른 계정으로 전환할 수 없다.
 *
 * logout() 성공 후 refetchSession()을 반드시 호출한다 — 캐시된 "authenticated" 상태가 남으면
 * PrivateRoute가 반응하지 않아 화면이 그대로 유지된다(sessionStore.js의 refetchSession 문서 참고).
 */
export function useLogout() {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      await refetchSession();
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "로그아웃에 실패했습니다."));
    } finally {
      setLoggingOut(false);
    }
  }

  return { handleLogout, loggingOut };
}
