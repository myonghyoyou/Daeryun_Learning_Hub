import { apiGet, apiPost } from "@/api/client.js";

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
