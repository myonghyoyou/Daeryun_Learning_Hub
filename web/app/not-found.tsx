import Link from "next/link";

// 정답지 F1: 지금은 react-router 의 영어 개발자 화면이 노출된다
// ("Unexpected Application Error! / 💿 Hey developer 👋").
// 한국어 사내 시스템에 맞지 않아 승인된 이탈 ㉢ 으로 교체한다.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-section-title font-bold text-ink-strong">
        요청한 페이지를 찾을 수 없습니다.
      </h1>
      <p className="text-body-small text-ink-muted">주소를 확인해 주세요.</p>
      <Link href="/solve" className="text-body-small font-medium text-brand-dark underline">
        학습 홈으로
      </Link>
    </main>
  );
}
