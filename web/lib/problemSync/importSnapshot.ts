import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  attempts, departments, problemAnswers, problemBlanks, problemChoices, problemTags, problems, tags, users,
} from "../db/schema";
import { findOrCreateTagsByNames } from "../db/tags";
import type { ProblemSnapshot } from "./snapshot";

export type ImportResult = {
  deletedAttempts: number;
  deletedProblems: number;
  createdDepartments: number;
  insertedProblems: number;
};

/**
 * 스냅샷으로 로컬 DB 의 문제를 통째로 교체한다.
 *
 * **첫 인자가 `Db` 다 — `DbConn` 이 아니다.** 이 함수가 트랜잭션을 연다. 이미 열린 핸들을
 * 받으면 Drizzle 이 SAVEPOINT 로 중첩시켜 "전부 되거나 전부 안 되거나"가 깨진다
 * (lib/solve/attemptService.ts 가 같은 이유로 같은 규칙을 쓴다).
 *
 * **호출 전에 반드시 assertSeedableEnvironment(lib/devSeed.ts)로 로컬 DB 인지 확인해야 한다.**
 * 이 함수는 기존 문제와 풀이 이력을 전부 지운다.
 */
export async function importSnapshot(db: Db, snapshot: ProblemSnapshot): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    // 1. 풀이 이력 먼저. attempts.problem_id 에는 연쇄 삭제가 걸려 있지 않아, 이력이 남아 있으면
    //    DB 가 문제 삭제를 거부한다. attempt_choices·attempt_blank_answers 는 attempts 에
    //    연쇄 삭제가 걸려 있어 함께 사라진다.
    const deletedAttempts = (await tx.delete(attempts).returning({ id: attempts.id })).length;

    // 2. 문제. 보기·정답·빈칸·문제태그는 problems 에 연쇄 삭제가 걸려 있어 함께 사라진다.
    const deletedProblems = (await tx.delete(problems).returning({ id: problems.id })).length;

    // 3. 부서를 코드로 맞춘다. 이미 있으면 이름·상태를 건드리지 않는다 — 로컬에는 검증용으로
    //    상태를 바꿔 둔 부서가 있을 수 있다(scripts/seed-dev.ts 와 같은 규칙).
    //    lib/db/departments.ts 의 insertDepartment 를 쓰지 않는 이유: 그 함수는 status 를
    //    항상 ACTIVE 로 박아, 운영에서 INACTIVE 인 부서를 그대로 옮길 수 없다.
    const departmentIdByCode = new Map<string, number>();
    let createdDepartments = 0;
    for (const dept of snapshot.departments) {
      const [found] = await tx.select({ id: departments.id }).from(departments)
        .where(eq(departments.code, dept.code));
      if (found) {
        departmentIdByCode.set(dept.code, found.id);
        continue;
      }
      const [created] = await tx.insert(departments)
        .values({ name: dept.name, code: dept.code, status: dept.status })
        .returning({ id: departments.id });
      departmentIdByCode.set(dept.code, created.id);
      createdDepartments++;
    }

    // 4. 작성자. 운영 작성자 계정은 옮기지 않으므로 로컬 총괄관리자로 대체한다.
    const [admin] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.role, "SUPER_ADMIN")).orderBy(asc(users.id)).limit(1);
    if (!admin) {
      throw new Error(
        "로컬에 SUPER_ADMIN 계정이 없습니다. pnpm bootstrap 또는 pnpm seed:dev 를 먼저 실행하세요.",
      );
    }

    // 5. 태그를 한 번에 맞춘다. 문제마다 부르면 700문항에 1,400번 왕복한다.
    //    findOrCreateTagsByNames 는 id 배열만 돌려주고 이름 대응을 알려주지 않으므로,
    //    만든 뒤 이름으로 다시 읽어 짝을 만든다.
    const tagNames = [...new Set(snapshot.problems.flatMap((p) => p.tags))];
    const tagIdByName = new Map<string, number>();
    if (tagNames.length > 0) {
      await findOrCreateTagsByNames(tx, tagNames);
      const rows = await tx.select({ id: tags.id, name: tags.name }).from(tags)
        .where(inArray(tags.name, tagNames));
      for (const row of rows) tagIdByName.set(row.name, row.id);
    }

    // 6. 문제와 딸린 것들.
    for (const problem of snapshot.problems) {
      // id 를 명시해 넣는다 — 운영과 같은 번호를 유지해야 "운영 512번"이 로컬에서도 512번이다.
      await tx.insert(problems).values({
        id: problem.id,
        type: problem.type,
        content: problem.content,
        imageUrl: problem.imageUrl,
        referenceText: problem.referenceText,
        explanation: problem.explanation,
        blankRevealCount: problem.blankRevealCount,
        status: problem.status,
        departmentId: departmentIdByCode.get(problem.departmentCode)!,
        sourceNumber: problem.sourceNumber,
        createdBy: admin.id,
        createdAt: new Date(problem.createdAt),
        updatedAt: new Date(problem.updatedAt),
      });

      // displayOrder 를 원본 그대로 넣는다. lib/db/problemParts.ts 의 insertChoices·insertBlanks 는
      // 배열 순서로 1..n 을 다시 매기므로 여기서는 쓰지 않는다.
      if (problem.choices.length > 0) {
        await tx.insert(problemChoices).values(problem.choices.map((c) => ({
          problemId: problem.id, choiceText: c.choiceText, isCorrect: c.isCorrect, displayOrder: c.displayOrder,
        })));
      }
      if (problem.answers.length > 0) {
        await tx.insert(problemAnswers).values(problem.answers.map((a) => ({
          problemId: problem.id, answerText: a.answerText,
        })));
      }
      if (problem.blanks.length > 0) {
        await tx.insert(problemBlanks).values(problem.blanks.map((b) => ({
          problemId: problem.id, blankKey: b.blankKey, answerText: b.answerText, displayOrder: b.displayOrder,
        })));
      }
      if (problem.tags.length > 0) {
        await tx.insert(problemTags).values(problem.tags.map((name) => ({
          problemId: problem.id, tagId: tagIdByName.get(name)!,
        })));
      }
    }

    // 7. 번호표를 되돌린다. id 를 명시해 넣으면 시퀀스가 그대로라, 다음에 문제를 새로 만들 때
    //    이미 쓰인 번호를 발급하려다 기본키 충돌로 죽는다.
    await tx.execute(sql`
      SELECT setval(pg_get_serial_sequence('problems', 'id'),
                    GREATEST((SELECT COALESCE(MAX(id), 0) FROM problems), 1))`);

    return {
      deletedAttempts,
      deletedProblems,
      createdDepartments,
      insertedProblems: snapshot.problems.length,
    };
  });
}
