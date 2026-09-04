import { apiGet, apiPost } from "@/apiClient/client.js";

export function sendFeedback({ body, problemId, sourcePath }) {
  return apiPost("/api/feedback", { body, problemId, sourcePath });
}

export function listUnsentFeedbacks() {
  return apiGet("/api/admin/feedbacks");
}

export function retryFeedbacks() {
  return apiPost("/api/admin/feedbacks/retry", {});
}
