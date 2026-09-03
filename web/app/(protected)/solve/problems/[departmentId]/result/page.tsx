"use client";
import { Suspense } from "react";
import TeamRunResultPage from "@/screens/solve/TeamRunResultPage.jsx";

// useSearchParams 를 쓰는 화면은 Suspense 로 감싸야 next build 가 통과한다.
// "use client" 와 Suspense 를 함께 두는 것은 app/login/page.tsx 와 같은 모양이다.
export default function Page() {
  return (
    <Suspense fallback={<p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>}>
      <TeamRunResultPage />
    </Suspense>
  );
}
