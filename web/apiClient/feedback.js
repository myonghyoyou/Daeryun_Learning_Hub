import { apiPost } from "@/apiClient/client.js";

export function sendFeedback({ body, problemId, sourcePath }) {
  return apiPost("/api/feedback", { body, problemId, sourcePath });
}
