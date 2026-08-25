"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { logout } from "@/apiClient/auth.js";
import { refetchSession } from "@/store/sessionStore.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

export function useLogout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      await refetchSession();          // 순서를 바꾸지 마라 — 아래 주의 참조
      router.replace("/login");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "로그아웃에 실패했습니다."));
    } finally {
      setLoggingOut(false);
    }
  }

  return { handleLogout, loggingOut };
}
