import { apiGet } from "@/apiClient/client.js";

export function fetchHallOfFame() {
  return apiGet("/api/solve/hall-of-fame");
}
