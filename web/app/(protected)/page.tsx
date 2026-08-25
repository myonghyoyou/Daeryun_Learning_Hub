"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { resolveLandingPath } from "@/utils/routing.js";

/**
 * `(protected)/layout.tsx` 아래이므로 이 컴포넌트가 렌더될 때는 이미
 * status === "authenticated" 이고 mustChangePassword 도 아니다 — 그 검사는 감싸는
 * 레이아웃이 끝냈다. 원본 Landing.jsx 와 마찬가지로 device + role 분기만 한다.
 * 인증 상태를 여기서 다시 검사하지 않는다.
 */
export default function Landing() {
  const { session } = useSessionStatus();   // status 는 안 쓴다 — 레이아웃이 이미 확정했다
  const device = useDeviceType();
  const router = useRouter();
  useEffect(() => {
    if (device !== null) router.replace(resolveLandingPath({ device, role: session?.role }));
  }, [device, session, router]);
  return <Loader visible message="세션 확인 중..." />;   // 정답지 N30
}
