import { Buildings, Users, Upload } from "@phosphor-icons/react";

/**
 * 8.6.1 관리자 Shell 메뉴 구성.
 * 부서 관리·계정 관리는 총괄 관리자에게만 노출하고, 그 외 역할에게는 비활성화
 * 상태로 보여주는 대신 아예 렌더링하지 않는다("부서 관리자에게는 숨긴다").
 *
 * 이 함수가 뒤집히거나 role 문자열에 오타가 나면 총괄 관리자 전용 메뉴가
 * 조용히 새거나 숨는다 — 이 Task에서 가장 spec에 직결된 파생 상태라 별도
 * 모듈로 분리해 테스트한다(adminNav.test.js).
 *
 * 대시보드 항목은 두지 않는다. /admin 은 라우터가 /admin/departments 로 리다이렉트하므로
 * end:true NavLink 가 활성화될 수 없고, 눌러도 "부서 관리"가 켜진 채 부서 화면으로 갈 뿐인
 * 죽은 링크가 된다. 실제 대시보드 화면은 Plan 5에서 추가하면서 함께 넣는다.
 *
 * end 규칙: NavLink 는 기본적으로 접두사로 매칭하므로, 어떤 항목의 경로가 다른 항목의
 * 경로의 접두사이면 그 항목에 end:true 를 줘야 한다. 없으면 두 메뉴가 동시에 활성으로
 * 보인다(/admin/users/excel-upload 에서 "계정 관리"까지 켜지던 문제). adminNav.test.js 가
 * 이 규칙을 자동으로 검사하므로, Plan 3 에서 /admin/problems/new 같은 하위 경로를 추가할 때도
 * 같은 실수가 반복되지 않는다.
 */
export function buildNavGroups(role) {
  const groups = [];
  if (role === "SUPER_ADMIN") {
    groups.push({
      label: "관리 메뉴",
      items: [
        { to: "/admin/departments", label: "부서 관리", icon: Buildings },
        { to: "/admin/users", label: "계정 관리", icon: Users, end: true },
        { to: "/admin/users/excel-upload", label: "계정 일괄 등록", icon: Upload },
      ],
    });
  }
  return groups;
}
