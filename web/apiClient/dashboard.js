import { apiGet } from "@/apiClient/client.js";

export function getDashboardSummary(departmentId) {
  const query = departmentId ? `?departmentId=${departmentId}` : "";
  return apiGet(`/api/admin/dashboard${query}`);
}
