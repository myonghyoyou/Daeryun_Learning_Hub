import { apiGet } from "@/apiClient/client.js";

/** 빈 문자열·undefined 는 쿼리에서 뺀다(problems.js listProblems 와 같은 규칙). */
export function listProblemStats(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ).toString();
  return apiGet(`/api/admin/stats/problems${query ? `?${query}` : ""}`);
}

export function getProblemStatDetail(id) {
  return apiGet(`/api/admin/stats/problems/${id}`);
}
