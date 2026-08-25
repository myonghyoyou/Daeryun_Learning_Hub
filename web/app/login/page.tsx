"use client";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Loader from "@/components/ui/Loader.jsx";
import LoginScreen from "@/screens/auth/LoginPage.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";

function LoginGate() {
  const { status } = useSessionStatus();
  const router = useRouter();
  useEffect(() => { if (status === "authenticated") router.replace("/"); }, [status, router]);
  if (status === "loading") return <Loader visible message="세션 확인 중..." />;   // N25
  if (status === "authenticated") return <Loader visible message="세션 확인 중..." />; // N24
  return <LoginScreen />;
}

// LoginPage 가 useSearchParams 로 ?reason=session-expired 를 읽는다(정답지 L1).
// App Router 에서 useSearchParams 는 Suspense 경계를 요구한다 — 없으면 빌드가 실패한다.
export default function Page() {
  return (
    <Suspense fallback={<Loader visible message="세션 확인 중..." />}>
      <LoginGate />
    </Suspense>
  );
}
