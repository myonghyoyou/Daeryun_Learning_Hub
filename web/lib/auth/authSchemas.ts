import type { UserRole } from "./types";

// Zod 스키마를 두지 않는 것은 의도다: Spring 도 이 요청들에 빈(bean) 검증이 없고,
// 검증 규칙·한국어 메시지가 전부 서비스 계층에 있다(파리티). Zod 를 끼우면
// 다른 형태의 오류(errorList)가 먼저 나가 현재 동작과 갈라진다.
export type LoginInput = { employeeNo?: string; password?: string };

export interface LoginResult {
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface SessionStatus {
  isLoggedIn: boolean;
  employeeNo: string | null;
  name: string | null;
  role: UserRole | null;
  departmentId: number | null;
  departmentName: string | null;
  mustChangePassword: boolean;
}
