import { apiGet } from "@/api/client.js";

export function getDashboardSummary(departmentId) {
  const query = departmentId ? `?departmentId=${departmentId}` : "";
  return apiGet(`/api/admin/dashboard${query}`);
}
