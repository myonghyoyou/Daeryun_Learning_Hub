"use client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { resolvePrivateRedirect } from "@/utils/routing.js";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { status, session } = useSessionStatus();
  const pathname = usePathname();
  const router = useRouter();
  const redirectTo = resolvePrivateRedirect({ status, session, pathname });

  // react-router 는 <Navigate> 를 렌더해 이동했다. Next 에는 그 컴포넌트가 없으므로
  // effect 에서 replace 한다. 렌더 중에 router.replace 를 부르면 React 가 경고한다.
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // 정답지 N22: status === "loading" 이면 리다이렉트하지 않고 Loader 만 보여준다.
  // 문구는 실측값 "세션 확인 중..." 을 그대로 쓴다.
  if (status === "loading") return <Loader visible message="세션 확인 중..." />;
  // redirectTo 일 때도 Loader 를 반환한다. 그러지 않으면 replace 가 완료되기 전
  // 한 프레임 동안 보호 화면이 그려진다. <Navigate> 는 즉시 전환이라 그 틈이 없었다.
  if (redirectTo) return <Loader visible message="세션 확인 중..." />;
  return <>{children}</>;
}
