import { apiGet, apiPost, apiPostForm, apiPut, apiDelete } from "@/api/client.js";

export function listProblems(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ).toString();
  return apiGet(`/api/admin/problems${query ? `?${query}` : ""}`);
}

export function listTags() {
  return apiGet("/api/tags");
}

export function getProblem(id) {
  return apiGet(`/api/admin/problems/${id}`);
}

// 컨트롤러가 @RequestParam 으로 받는다. ProblemCreateRequest 는 update() 와 공유되는 DTO 라
// 본문에 넣지 않는다 — 넣으면 수정 경로에도 부서 지정 표면이 생긴다.
export function createProblem(payload, departmentId) {
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
  return apiPost(`/api/admin/problems${query}`, payload);
}

export function updateProblem(id, payload) {
  return apiPut(`/api/admin/problems/${id}`, payload);
}

export function changeProblemDepartment(id, departmentId) {
  return apiPut(`/api/admin/problems/${id}/department`, { departmentId: Number(departmentId) });
}

export function archiveProblem(id) {
  return apiDelete(`/api/admin/problems/${id}`);
}

export function uploadProblemImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm("/api/admin/problems/images", formData);
}

export function uploadProblemsExcel(file, departmentId) {
  const formData = new FormData();
  formData.append("file", file);
  // 컨트롤러가 @RequestParam 으로 받으므로 쿼리스트링으로 보낸다.
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
  return apiPostForm(`/api/admin/problems/excel-upload${query}`, formData);
}
