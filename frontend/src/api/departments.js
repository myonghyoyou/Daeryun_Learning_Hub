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
