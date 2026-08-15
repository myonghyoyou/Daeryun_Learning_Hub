export type UserRole = "SUPER_ADMIN" | "DEPT_ADMIN" | "EMPLOYEE";

export interface AuthUser {
  userId: number;
  employeeNo: string;
  name: string;
  role: UserRole;
  departmentId: number;
  mustChangePassword: boolean;
}
