// 디자인 시스템 7.1 AppShell: 220px Sidebar + AppMain(Topbar + PageContent).
// PageContent는 최대 1440px, 좌우 28px 패딩을 사용한다.
export default function AppShell({ sidebar, topbar, children }) {
  return (
    <div className="flex h-screen bg-surface-page">
      {sidebar}
      <div className="flex flex-1 flex-col overflow-hidden">
        {topbar}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-7 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
