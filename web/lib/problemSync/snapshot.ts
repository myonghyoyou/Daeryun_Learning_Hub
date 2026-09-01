// 운영 → 로컬 문제 동기화가 주고받는 스냅샷 파일의 형식과 검증.
// scripts/sync-problems-export.ts 가 만들고 scripts/sync-problems-import.ts 가 읽는다.
//
// 사람 정보는 담지 않는다 — 운영 작성자(created_by)는 옮기지 않고, 들여올 때 로컬
// 총괄관리자로 대체한다(설계 문서 "안전장치" 참고).

export const SNAPSHOT_VERSION = 1;

// scripts 는 web/ 를 작업 디렉터리로 실행된다. .data/ 는 .gitignore 대상이다.
export const SNAPSHOT_PATH = ".data/prod-problems.json";

export type SnapshotDepartment = { code: string; name: string; status: string };
export type SnapshotChoice = { choiceText: string; isCorrect: boolean; displayOrder: number };
export type SnapshotAnswer = { answerText: string };
export type SnapshotBlank = { blankKey: string; answerText: string; displayOrder: number };

export type SnapshotProblem = {
  id: number;
  type: string;
  content: string;
  imageUrl: string | null;
  referenceText: string | null;
  explanation: string | null;
  blankRevealCount: number | null;
  status: string;
  // 부서를 번호가 아니라 코드로 적는다. 운영과 로컬은 부서의 내부 번호가 서로 달라서,
  // 번호를 그대로 옮기면 문제가 엉뚱한 부서에 붙는다.
  departmentCode: string;
  sourceNumber: number | null;
  createdAt: string;
  updatedAt: string;
  choices: SnapshotChoice[];
  answers: SnapshotAnswer[];
  blanks: SnapshotBlank[];
  tags: string[];
};

export type ProblemSnapshot = {
  version: number;
  generatedAt: string;
  source: { host: string; database: string };
  counts: { departments: number; problems: number; tags: number };
  departments: SnapshotDepartment[];
  problems: SnapshotProblem[];
};

function fail(message: string): never {
  throw new Error(`스냅샷 형식이 올바르지 않습니다: ${message}`);
}

function asRecord(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${at} 가 객체가 아닙니다.`);
  return value as Record<string, unknown>;
}

function asArray(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) fail(`${at} 가 배열이 아닙니다.`);
  return value;
}

function asString(value: unknown, at: string): string {
  if (typeof value !== "string") fail(`${at} 가 문자열이 아닙니다.`);
  return value;
}

function asNullableString(value: unknown, at: string): string | null {
  return value === null ? null : asString(value, at);
}

function asNumber(value: unknown, at: string): number {
  // "501" 같은 문자열을 통과시키면 문제 번호가 문자열로 새어 들어간다 — postgres.js 가
  // int8 을 문자열로 돌려주는 경우를 여기서 잡는다.
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${at} 가 숫자가 아닙니다.`);
  return value;
}

function asNullableNumber(value: unknown, at: string): number | null {
  return value === null ? null : asNumber(value, at);
}

function asBoolean(value: unknown, at: string): boolean {
  if (typeof value !== "boolean") fail(`${at} 가 참/거짓이 아닙니다.`);
  return value;
}

/**
 * 파일에서 읽은 값을 검증해 스냅샷으로 만든다. 어긋나면 어느 자리가 잘못됐는지 밝혀 던진다.
 *
 * 들여오기는 기존 문제와 풀이 이력을 전부 지우고 시작한다 — 절반쯤 읽다가 중간에 터지면
 * 로컬이 빈 채로 남는다. 그래서 DB 를 건드리기 전에 파일 전체를 여기서 먼저 검증한다.
 */
export function parseSnapshot(raw: unknown): ProblemSnapshot {
  const root = asRecord(raw, "최상위");

  const version = asNumber(root.version, "version");
  if (version !== SNAPSHOT_VERSION) {
    fail(`version 이 ${SNAPSHOT_VERSION} 이 아닙니다(받은 값: ${version}). 내보내기를 다시 실행하세요.`);
  }

  const source = asRecord(root.source, "source");
  const counts = asRecord(root.counts, "counts");

  const departments = asArray(root.departments, "departments").map((d, i) => {
    const rec = asRecord(d, `departments[${i}]`);
    return {
      code: asString(rec.code, `departments[${i}].code`),
      name: asString(rec.name, `departments[${i}].name`),
      status: asString(rec.status, `departments[${i}].status`),
    };
  });

  const problems = asArray(root.problems, "problems").map((p, i) => {
    const at = `problems[${i}]`;
    const rec = asRecord(p, at);
    return {
      id: asNumber(rec.id, `${at}.id`),
      type: asString(rec.type, `${at}.type`),
      content: asString(rec.content, `${at}.content`),
      imageUrl: asNullableString(rec.imageUrl, `${at}.imageUrl`),
      referenceText: asNullableString(rec.referenceText, `${at}.referenceText`),
      explanation: asNullableString(rec.explanation, `${at}.explanation`),
      blankRevealCount: asNullableNumber(rec.blankRevealCount, `${at}.blankRevealCount`),
      status: asString(rec.status, `${at}.status`),
      departmentCode: asString(rec.departmentCode, `${at}.departmentCode`),
      sourceNumber: asNullableNumber(rec.sourceNumber, `${at}.sourceNumber`),
      createdAt: asString(rec.createdAt, `${at}.createdAt`),
      updatedAt: asString(rec.updatedAt, `${at}.updatedAt`),
      choices: asArray(rec.choices, `${at}.choices`).map((c, j) => {
        const cr = asRecord(c, `${at}.choices[${j}]`);
        return {
          choiceText: asString(cr.choiceText, `${at}.choices[${j}].choiceText`),
          isCorrect: asBoolean(cr.isCorrect, `${at}.choices[${j}].isCorrect`),
          displayOrder: asNumber(cr.displayOrder, `${at}.choices[${j}].displayOrder`),
        };
      }),
      answers: asArray(rec.answers, `${at}.answers`).map((a, j) => ({
        answerText: asString(asRecord(a, `${at}.answers[${j}]`).answerText, `${at}.answers[${j}].answerText`),
      })),
      blanks: asArray(rec.blanks, `${at}.blanks`).map((b, j) => {
        const br = asRecord(b, `${at}.blanks[${j}]`);
        return {
          blankKey: asString(br.blankKey, `${at}.blanks[${j}].blankKey`),
          answerText: asString(br.answerText, `${at}.blanks[${j}].answerText`),
          displayOrder: asNumber(br.displayOrder, `${at}.blanks[${j}].displayOrder`),
        };
      }),
      tags: asArray(rec.tags, `${at}.tags`).map((t, j) => asString(t, `${at}.tags[${j}]`)),
    };
  });

  // 문제가 가리키는 부서 코드가 목록에 없으면 들여오기가 중간에 죽는다. 파일을 읽는 시점에 잡는다.
  const codes = new Set(departments.map((d) => d.code));
  for (const problem of problems) {
    if (!codes.has(problem.departmentCode)) {
      fail(`문제 ${problem.id} 의 부서 코드 ${problem.departmentCode} 가 departments 목록에 없습니다.`);
    }
  }

  return {
    version,
    generatedAt: asString(root.generatedAt, "generatedAt"),
    source: {
      host: asString(source.host, "source.host"),
      database: asString(source.database, "source.database"),
    },
    counts: {
      departments: asNumber(counts.departments, "counts.departments"),
      problems: asNumber(counts.problems, "counts.problems"),
      tags: asNumber(counts.tags, "counts.tags"),
    },
    departments,
    problems,
  };
}
