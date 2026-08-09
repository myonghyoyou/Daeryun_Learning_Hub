// 디자인 시스템 7.1 AppShell: 220px Sidebar + AppMain(Topbar + PageContent).
// PageContent는 최대 1440px, 좌우 28px 패딩을 사용한다.
//
// 스크롤은 문서가 담당한다. 이전에는 h-screen + overflow-hidden 으로 화면 높이에 고정하고
// main 만 내부 스크롤했는데, 그러면 창이 조금만 짧아도 목록 카드가 하단 테두리 없이 잘려
// 렌더링 오류처럼 보였다 — 8행짜리 부서 목록도 창 높이 800px에서 잘렸다. Sidebar와 Topbar는
// sticky 로 화면에 남으므로 상단 고정 효과는 그대로다.
//
// min-w-0 이 필요한 이유: overflow-hidden 을 걷어내면 넓은 표가 flex 아이템의 최소 콘텐츠
// 크기를 밀어 올려 레이아웃이 늘어난다. 표 자체는 감싸는 div 의 overflow-x-auto 로 스크롤한다.
export default function AppShell({ sidebar, topbar, children }) {
  return (
    <div className="flex min-h-screen bg-surface-page">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main className="flex-1">
          <div className="mx-auto max-w-[1440px] px-7 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
