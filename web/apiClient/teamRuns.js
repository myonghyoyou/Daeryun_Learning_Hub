import { apiGet, apiPost } from "@/apiClient/client.js";

export function listTeams() {
  return apiGet("/api/solve/teams");
}

export function startTeamRun(departmentId, mode) {
  return apiPost(`/api/solve/teams/${departmentId}/runs`, { mode });
}

export function getRun(runId) {
  return apiGet(`/api/solve/runs/${runId}`);
}

// 바퀴가 하나도 없으면 null 이 온다 — 오류가 아니다.
export function getLatestRun(departmentId) {
  return apiGet(`/api/solve/teams/${departmentId}/runs/latest`);
}

export function advanceRun(runId, fromCursor, correct) {
  return apiPost(`/api/solve/runs/${runId}/advance`, { fromCursor, correct });
}

export function finishRun(runId) {
  return apiPost(`/api/solve/runs/${runId}/finish`, {});
}
