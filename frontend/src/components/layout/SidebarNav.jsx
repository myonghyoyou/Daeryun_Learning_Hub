import { NavLink } from "react-router-dom";
import { ArrowSquareOut } from "@phosphor-icons/react";

const menuLinkClass = (isActive) =>
  `flex h-[38px] items-center gap-2 rounded-sm border-l-2 px-3 text-body-small font-medium transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua ${
    isActive
      ? "border-brand-aqua bg-selection-bg text-brand-dark"
      : "border-transparent text-ink-muted hover:bg-[#F0F7FB] hover:text-ink-strong"
  }`;

/**
 * 디자인 시스템 7.2 SidebarNav + 8.6.1 관리자 Shell.
 * groups는 AdminLayout이 role에 따라 미리 걸러 전달한다(부서·계정 관리는
 * 총괄 관리자에게만 렌더링되며, 부서 관리자에게는 비활성화가 아니라 아예 숨긴다).
 * 그룹 라벨 9px/메뉴 38px 행/그룹 간 18px 간격은 7.2가 명시한 값이며
 * tokens.css에 해당 정확한 값의 전용 토큰이 없어 arbitrary value로 표현한다.
 *
 * sticky top-0 h-screen: AppShell이 문서 스크롤로 바뀌면서 더 이상 높이를 고정하지 않는다.
 * h-screen이 없으면 사이드바가 콘텐츠 높이만큼만 되고 아래 메뉴 영역의 flex-1이 기준 높이를
 * 잃는다. overflow-y-auto는 여기 두지 않는다 — 메뉴 영역이 이미 갖고 있어 이중 스크롤이 된다.
 */
export default function SidebarNav({ groups }) {
  return (
    <nav
      className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-line-default bg-surface-default"
      aria-label="관리자 메뉴"
    >
      <div className="flex h-[76px] items-center border-b border-line-default px-6">
        <span className="text-card-title font-bold tracking-title text-ink-strong">문제 은행 Hub</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-[18px] last:mb-0">
            <p className="px-3 text-[9px] font-bold uppercase tracking-wide text-ink-subtle">{group.label}</p>
            <ul className="mt-2 space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className={({ isActive }) => menuLinkClass(isActive)}>
                    {item.icon && <item.icon size={18} aria-hidden="true" />}
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line-default p-3">
        <NavLink to="/solve" className={({ isActive }) => menuLinkClass(isActive)}>
          <ArrowSquareOut size={18} aria-hidden="true" />
          학습 화면으로 이동
        </NavLink>
      </div>
    </nav>
  );
}
