import { eq } from "drizzle-orm";
import type { DbConn } from "../db/client";
import type { AuthUser } from "../auth/types";
import { departments, problems, users } from "../db/schema";
import { findUnsent, insertFeedback, markFailed, markSent } from "../db/feedbacks";
import { validateFeedbackInput } from "./validate";
import { composeBody, composeFrom } from "./compose";
import { sendFeedback } from "./relay";

const FAIL_MESSAGE = "지금은 보낼 수 없습니다. 잠시 뒤 다시 시도해 주세요.";
const BUSY_MESSAGE = "지금 접수가 몰려 있습니다. 잠시 뒤 다시 보내 주세요.";

/** 화면이 보낸 문자열을 믿지 않는다 — 부서·번호·유형은 서버가 DB 에서 찾는다. */
async function findProblemContext(db: DbConn, problemId: number | undefined) {
  if (!problemId) return null;
  const [row] = await db.select({
    id: problems.id, type: problems.type, sourceNumber: problems.sourceNumber,
    departmentName: departments.name,
  }).from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .where(eq(problems.id, problemId));
  // 없는 id 면 일반 의견으로 처리한다. 본문은 멀쩡한데 참조 하나 때문에 말을 버리지 않는다.
  return row ?? null;
}

export async function submitFeedback(
  db: DbConn,
  actor: AuthUser,
  input: { body: unknown; sourcePath?: unknown; problemId?: number },
): Promise<{ ok: boolean; message: string }> {
  const { body, sourcePath } = validateFeedbackInput(input);
  const problem = await findProblemContext(db, input.problemId);

  // 저장이 먼저다. 저장 없이 보내면 실패했을 때 아무 데도 남지 않는다.
  const { id } = await insertFeedback(db, {
    userId: actor.userId, problemId: problem?.id ?? null, sourcePath, body,
  });

  const result = await sendFeedback({
    body: composeBody({ body, sourcePath, problem }),
    from: composeFrom(actor.name, actor.employeeNo),
  });

  if (result.ok) {
    await markSent(db, id, result.taskId);
    return { ok: true, message: "보냈습니다. 고맙습니다." };
  }
  await markFailed(db, id, result.reason);
  // 원문은 로그로만. 받는 쪽 문구를 그대로 보이면 내부 사정이 새고, 읽어도 할 수 있는 게 없다.
  console.error("[feedback] 전달 실패", result.reason, result.detail);
  return { ok: false, message: result.reason === "busy" ? BUSY_MESSAGE : FAIL_MESSAGE };
}

/**
 * 다시 보내기. **429 를 만나면 즉시 멈춘다** — 한도가 서비스 전체 공유라, 실패한 것을
 * 한꺼번에 밀면 그 시간대의 정상 제출이 막힌다.
 */
export async function retryUnsent(
  db: DbConn, limit: number,
): Promise<{ tried: number; sent: number; stoppedByLimit: boolean }> {
  const rows = await findUnsent(db, limit);
  let tried = 0;
  let sent = 0;
  for (const row of rows) {
    const problem = await findProblemContext(db, row.problemId ?? undefined);
    // 보낸 사람은 그때 그 사람이다. 다시 보내는 관리자의 이름을 실으면 안 된다.
    const [user] = await db.select({ name: users.name, employeeNo: users.employeeNo })
      .from(users).where(eq(users.id, row.userId));
    tried += 1;
    const result = await sendFeedback({
      body: composeBody({ body: row.body, sourcePath: row.sourcePath, problem }),
      from: composeFrom(user.name, user.employeeNo),
    });
    if (result.ok) {
      await markSent(db, row.id, result.taskId);
      sent += 1;
      continue;
    }
    await markFailed(db, row.id, result.reason);
    if (result.reason === "busy") return { tried, sent, stoppedByLimit: true };
    // config(비밀·URL 설정 없음)는 이 서버가 살아 있는 동안 다음 행도 똑같이 실패한다.
    // 멈추지 않으면 남은 모든 행의 attempt_count 만 헛되이 올라간다. 한도 때문에 멈춘
    // 것이 아니므로 stoppedByLimit 은 false 다.
    if (result.reason === "config") return { tried, sent, stoppedByLimit: false };
  }
  return { tried, sent, stoppedByLimit: false };
}
