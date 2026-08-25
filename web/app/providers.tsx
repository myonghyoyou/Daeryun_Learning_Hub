"use client";
import { useEffect, useRef } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { registerSessionRedirects } from "@/apiClient/sessionRedirects.js";
import { markSessionExpired } from "@/store/sessionStore.js";

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const registered = useRef(false);
  useEffect(() => {
    // main.jsx 는 모듈 최상위라 1회가 보장됐다. 컴포넌트 안으로 들어오면
    // StrictMode 가 effect 를 두 번 실행하므로 ref 로 막는다(정답지 G8).
    if (registered.current) return;
    registered.current = true;
    registerSessionRedirects({
      router: {
        navigate: (to: string, opts?: { replace?: boolean }) =>
          opts?.replace ? router.replace(to) : router.push(to),
        // getter 로 둔다. 값으로 굳히면 등록 시점(첫 마운트)의 경로가 세션 내내
        // 박제돼, sessionRedirects 의 "이미 목적지면 이동하지 않는다" 판정이
        // 항상 첫 진입 경로로 내려진다(react-router 의 router.state 는 live 였다).
        get state() {
          return { location: { pathname: window.location.pathname } };
        },
      },
      markSessionExpired,
    });
  }, [router]);
  return (
    <>
      {children}
      {/* 정답지 G9: 위치·스타일이 App.jsx 와 같아야 한다 — position 과 CSS import 를 유지한다. */}
      <ToastContainer position="top-center" />
    </>
  );
}
