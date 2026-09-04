import { Buildings, Users, Upload, ClipboardText, House, ChartBar, ChatText } from "@phosphor-icons/react";

/**
 * 8.6.1 관리자 Shell 메뉴 구성.
 * 부서 관리·계정 관리는 총괄 관리자에게만 노출하고, 그 외 역할에게는 비활성화
 * 상태로 보여주는 대신 아예 렌더링하지 않는다("부서 관리자에게는 숨긴다").
 * 문제 관리(Plan 3)는 두 관리자 역할 모두에게 노출한다 — GET /api/admin/problems가
 * DEPT_ADMIN을 자기 부서로 서버에서 강제 스코핑하므로(ProblemServiceImpl.list), 화면
 * 자체는 총괄/부서 관리자 모두 볼 수 있어야 한다(디자인 시스템 8.7 "부서 관리자는 자기
 * 부서 데이터만 보며, 이 범위는 UI가 아니라 서버 권한으로 보장한다").
 *
 * 이 함수가 뒤집히거나 role 문자열에 오타가 나면 총괄 관리자 전용 메뉴가
 * 조용히 새거나 숨는다 — 이 Task에서 가장 spec에 직결된 파생 상태라 별도
 * 모듈로 분리해 테스트한다(adminNav.test.js).
 *
 * 대시보드 항목은 Plan 5에서 추가했다. /admin 은 라우터가 /admin/dashboard 로 리다이렉트하고
 * 실제 화면이 존재하므로 죽은 링크가 아니다.
 *
 * end 규칙: NavLink 는 기본적으로 접두사로 매칭하므로, 어떤 항목의 경로가 다른 항목의
 * 경로의 접두사이면 그 항목에 end:true 를 줘야 한다. 없으면 두 메뉴가 동시에 활성으로
 * 보인다(/admin/users/excel-upload 에서 "계정 관리"까지 켜지던 문제). adminNav.test.js 가
 * 이 규칙을 자동으로 검사한다. /admin/problems는 Task 8(/admin/problems/new,
 * /admin/problems/:id/edit)과 Task 9(/admin/problems/excel-upload)가 하위 경로를
 * 추가하므로 end:true를 준다.
 *
 * Task 9: 문제 엑셀 일괄 등록은 계정 일괄 등록과 같은 패턴으로 "문제 관리" 바로 아래에
 * 별도 메뉴 항목을 둔다(디자인 시스템 8.6.1의 Sidebar 구조: 문제 관리 하위에 문제 엑셀
 * 일괄 등록을 나열). 문제 관리 자체가 총괄/부서 관리자 모두에게 노출되므로, 이 항목도
 * if(role === "SUPER_ADMIN") 블록 밖에 두어 두 역할 모두에게 노출한다.
 */
export function buildNavGroups(role) {
  if (role !== "SUPER_ADMIN" && role !== "DEPT_ADMIN") {
    return [];
  }
  // 대시보드는 두 역할 공통의 랜딩이라 맨 앞에 둔다(PRD 3.2). /admin/dashboard 는
  // 다른 항목의 접두사가 아니므로 end 가 필요 없다.
  const items = [{ to: "/admin/dashboard", label: "대시보드", icon: House }];
  if (role === "SUPER_ADMIN") {
    items.push(
      { to: "/admin/departments", label: "부서 관리", icon: Buildings },
      { to: "/admin/users", label: "계정 관리", icon: Users, end: true },
      { to: "/admin/users/excel-upload", label: "계정 일괄 등록", icon: Upload },
    );
  }
  items.push(
    { to: "/admin/problems", label: "문제 관리", icon: ClipboardText, end: true },
    { to: "/admin/problems/excel-upload", label: "문제 엑셀 일괄 등록", icon: Upload },
    // /admin/stats/:id 로 들어가도 "통계"가 켜져 있어야 하므로 end 를 주지 않는다.
    { to: "/admin/stats", label: "통계", icon: ChartBar },
    // 피드백은 두 관리자 역할 모두가 의견을 보낼 수 있어야 한다. 전달 실패 목록/다시 보내기는
    // SUPER_ADMIN 전용이며 화면(FeedbackPage) 안에서 role 로 가린다.
    { to: "/admin/feedback", label: "피드백", icon: ChatText },
  );
  return [{ label: "관리 메뉴", items }];
}
