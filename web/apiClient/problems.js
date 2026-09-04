import { apiGet, apiPost, apiPostForm, apiPut, apiDelete } from "@/apiClient/client.js";

export function listProblems(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ).toString();
  return apiGet(`/api/admin/problems${query ? `?${query}` : ""}`);
}

export function listTags() {
  return apiGet("/api/tags");
}

/** 활성 문제에 실제로 붙어 있는 태그만. 직원 풀이 화면 필터용(관리자 화면은 listTags 유지). */
export function listTagsInUse() {
  return apiGet("/api/tags/in-use");
}

export function getProblem(id) {
  return apiGet(`/api/admin/problems/${id}`);
}

/** 값이 있는 것만 쿼리스트링으로 만든다. 부서·직군 모두 @RequestParam 이다. */
function adminQuery(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

// 컨트롤러가 @RequestParam 으로 받는다. ProblemCreateRequest 는 update() 와 공유되는 DTO 라
// 본문에 넣지 않는다 — 넣으면 수정 경로에도 부서 지정 표면이 생긴다.
export function createProblem(payload, departmentId, track) {
  return apiPost(`/api/admin/problems${adminQuery({ departmentId, track })}`, payload);
}

// 직군은 수정으로도 바꿀 수 있다 — 부서와 달리 전용 이동 기능이 없어, 잘못 등록한 직군을
// 되돌릴 유일한 통로가 수정 화면이다. **화면이 현재 직군을 반드시 실어 보내야 한다.**
// 안 보내면 서버가 행정직으로 읽어 기술직 문제가 조용히 바뀐다.
export function updateProblem(id, payload, track) {
  return apiPut(`/api/admin/problems/${id}${adminQuery({ track })}`, payload);
}

export function changeProblemDepartment(id, departmentId) {
  return apiPut(`/api/admin/problems/${id}/department`, { departmentId: Number(departmentId) });
}

/** 등록 폼이 번호 칸을 미리 채우는 데 쓴다. 부서 관리자는 서버가 자기 부서로 강제한다. */
export function fetchNextSourceNumber(departmentId) {
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
  return apiGet(`/api/admin/problems/next-source-number${query}`);
}

export function archiveProblem(id) {
  return apiDelete(`/api/admin/problems/${id}`);
}

export function uploadProblemImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm("/api/admin/problems/images", formData);
}

export function uploadProblemsExcel(file, departmentId, track) {
  const formData = new FormData();
  formData.append("file", file);
  // 컨트롤러가 @RequestParam 으로 받으므로 쿼리스트링으로 보낸다.
  return apiPostForm(`/api/admin/problems/excel-upload${adminQuery({ departmentId, track })}`, formData);
}
