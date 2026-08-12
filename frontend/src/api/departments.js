import { apiGet, apiPost, apiPut } from "@/api/client.js";

export function listDepartments() {
  return apiGet("/api/admin/departments");
}

export function createDepartment({ name, code }) {
  return apiPost("/api/admin/departments", { name, code });
}

export function updateDepartment(id, { name, status }) {
  return apiPut(`/api/admin/departments/${id}`, { name, status });
}

/** 활성 부서 선택지. 랜덤 풀이에서 부서를 고를 때 쓴다. */
export function listDepartmentOptions() {
  return apiGet("/api/departments");
}
