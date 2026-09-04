import type { Track } from "../problem/track";

export type UserRole = "SUPER_ADMIN" | "DEPT_ADMIN" | "EMPLOYEE";

export interface AuthUser {
  userId: number;
  employeeNo: string;
  name: string;
  role: UserRole;
  departmentId: number;
  mustChangePassword: boolean;
  /** 로그인할 때 고른 직군. 사람의 속성이 아니라 이 세션의 화면 필터다. */
  track: Track;
}
