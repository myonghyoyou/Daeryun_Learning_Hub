import type { DbConn } from "../db/client";
import { auditLogs } from "../db/schema";

// Spring AuditLogServiceImpl 미러: detail 에 "password" 를 포함한 키가 재귀적으로 존재하면
// fail-closed 로 거부한다. 임시 비밀번호가 감사 로그로 새는 사고를 구조적으로 막는다.
function findPasswordKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) { const hit = findPasswordKey(item); if (hit) return hit; }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.toLowerCase().includes("password")) return key;
      const hit = findPasswordKey(child); if (hit) return hit;
    }
  }
  return null;
}

export async function recordAudit(db: DbConn, entry: {
  actorId: number; action: string; targetType: string; targetId: number | null;
  detail: Record<string, unknown> | null;
}): Promise<void> {
  if (entry.detail !== null) {
    const offending = findPasswordKey(entry.detail);
    if (offending) throw new Error(`audit detail must not contain a password-related key: '${offending}'`);
  }
  await db.insert(auditLogs).values({
    actorId: entry.actorId, action: entry.action, targetType: entry.targetType,
    targetId: entry.targetId, detail: entry.detail,
  });
}
