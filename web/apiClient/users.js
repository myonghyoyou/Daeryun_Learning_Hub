import { apiGet, apiPost, apiPostForm, apiPut } from "@/apiClient/client.js";

export function listUsers(departmentId) {
  const query = departmentId ? `?departmentId=${departmentId}` : "";
  return apiGet(`/api/admin/users${query}`);
}

// 임시 비밀번호는 응답에 담기지 않는다 — 회사 메일로만 발송된다(mailSent).
export function createUser({ employeeNo, name, email, departmentId, role }) {
  return apiPost("/api/admin/users", { employeeNo, name, email, departmentId, role });
}

export function updateUser(id, { name, email, departmentId, role, status }) {
  return apiPut(`/api/admin/users/${id}`, { name, email, departmentId, role, status });
}

export function uploadUsersExcel(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm("/api/admin/users/excel-upload", formData);
}
