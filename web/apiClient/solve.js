import { apiGet, apiPost } from "@/apiClient/client.js";

export function listSolveProblems(keyword, tag) {
  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (tag) params.set("tag", tag);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/problems${query}`);
}

export function getSolveProblem(id) {
  return apiGet(`/api/problems/${id}`);
}

export function submitAttempt(id, payload) {
  return apiPost(`/api/problems/${id}/attempts`, payload);
}

export function myAttemptHistory() {
  return apiGet("/api/attempts/me");
}

export function fetchRandomSet(count, departmentId) {
  const params = new URLSearchParams();
  params.set("count", String(count));
  if (departmentId) params.set("departmentId", String(departmentId));
  return apiGet(`/api/problems/random?${params.toString()}`);
}
