import { apiGet, apiPost } from "@/apiClient/client.js";

export function login({ employeeNo, password, track }) {
  return apiPost("/api/auth/login", { employeeNo, password, track });
}

export function logout() {
  return apiPost("/api/auth/logout", {});
}

export function getSession() {
  return apiGet("/api/auth/session");
}

export function changePassword({ newPassword }) {
  return apiPost("/api/auth/change-password", { newPassword });
}
