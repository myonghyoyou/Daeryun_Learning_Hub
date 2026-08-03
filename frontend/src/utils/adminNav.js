import { Gauge, Buildings, Users, Upload } from "@phosphor-icons/react";

/**
 * 8.6.1 관리자 Shell 메뉴 구성.
 * 부서 관리·계정 관리는 총괄 관리자에게만 노출하고, 그 외 역할에게는 비활성화
 * 상태로 보여주는 대신 아예 렌더링하지 않는다("부서 관리자에게는 숨긴다").
 *
 * 이 함수가 뒤집히거나 role 문자열에 오타가 나면 총괄 관리자 전용 메뉴가
 * 조용히 새거나 숨는다 — 이 Task에서 가장 spec에 직결된 파생 상태라 별도
 * 모듈로 분리해 테스트한다(adminNav.test.js).
 */
export function buildNavGroups(role) {
  const groups = [
    {
      label: "주요 메뉴",
      items: [{ to: "/admin", label: "대시보드", icon: Gauge, end: true }],
    },
  ];
  if (role === "SUPER_ADMIN") {
    groups.push({
      label: "관리 메뉴",
      items: [
        { to: "/admin/departments", label: "부서 관리", icon: Buildings },
        { to: "/admin/users", label: "계정 관리", icon: Users },
        { to: "/admin/users/excel-upload", label: "계정 일괄 등록", icon: Upload },
      ],
    });
  }
  return groups;
}
