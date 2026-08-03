/**
 * 백엔드(Spring Boot) 공통 fetch 래퍼.
 * 모든 요청에 credentials: 'include'를 강제해 세션 쿠키를 동봉한다.
 * 응답은 { resultCode, resultMsg, data } 형태의 ResponseDto를 공통으로 가정한다.
 * resultCode 980(세션 만료), 1012(비밀번호 변경 필요)는 등록된 리스너를 호출한다.
 */

const BASE_URL = import.meta.env?.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(resultCode, resultMsg, data) {
    super(resultMsg || `API 요청이 실패했습니다. (resultCode: ${resultCode})`);
    this.name = "ApiError";
    this.resultCode = resultCode;
    this.resultMsg = resultMsg;
    this.data = data;
  }
}

export function resolveErrorMessage(error, fallback) {
  return error instanceof ApiError ? error.message : fallback;
}

let sessionExpiredListener = null;
let passwordChangeRequiredListener = null;

export function setOnSessionExpired(listener) {
  sessionExpiredListener = listener;
}

export function setOnPasswordChangeRequired(listener) {
  passwordChangeRequiredListener = listener;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  const json = await response.json();

  if (json.resultCode === 980) {
    sessionExpiredListener?.();
  }
  if (json.resultCode === 1012) {
    passwordChangeRequiredListener?.();
  }
  if (json.resultCode !== 200) {
    throw new ApiError(json.resultCode, json.resultMsg, json.data ?? json.errorList);
  }

  return json.data;
}

export function apiGet(path) {
  return request(path, { method: "GET" });
}

export function apiPost(path, body, options = {}) {
  return request(path, { method: "POST", body: JSON.stringify(body), ...options });
}

export function apiPostForm(path, formData) {
  return request(path, { method: "POST", body: formData });
}
