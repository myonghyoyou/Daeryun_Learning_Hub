import { FEEDBACK_MAX_BODY, FROM_MAX } from "./validate";

export { FEEDBACK_MAX_BODY, FROM_MAX };

const TITLE_MAX = 60;

/**
 * 유형 라벨을 여기 직접 둔다. `utils/problemLabels.js` 를 쓰지 않는 이유가 둘이다.
 *
 * 첫째, `lib/**\/*.ts` 가 `utils/*.js` 를 import 하는 선례가 이 저장소에 없다(2026-09-04
 * 확인). `allowJs` 는 켜져 있지만 타입 없는 모듈이 strict 경계로 들어온다.
 *
 * 둘째, 이 글자는 남의 보드에 나간다. 화면 라벨을 바꾼다고 이미 보낸 카드의 표기 규칙까지
 * 따라 바뀌면 곤란하다 — 두 곳이 같은 값을 쓰되 서로를 끌고 다니지는 않게 한다.
 */
const TYPE_LABEL: Record<string, string> = {
  MCQ_SINGLE: "객관식(단일)",
  MCQ_MULTI: "객관식(복수)",
  OX: "OX",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸 채우기",
};

/**
 * 보낸 사람. 이름과 사번만 넣는다 — 이 값은 남의 업무 메모 첫 줄이 되고 여러 명이 본다.
 * 40자를 넘으면 사번을 그대로 두고 이름 쪽을 자른다. 사번이 잘리면 되묻는 길이 끊긴다.
 */
export function composeFrom(name: string, employeeNo: string): string {
  const tail = `(${employeeNo})`;
  // 사번 자체가 40자를 채우거나 넘으면(`users.employee_no` 는 varchar(50)) 이름은 물론
  // 괄호를 넣을 자리도 없다. 이름·괄호를 다 버리고 사번 앞부분만 남긴다 — 닫는 괄호가
  // 잘려 "(abcdefgh…" 처럼 알아볼 수 없는 모양이 되는 것보다는, 사번이라도 앞부분이
  // 온전히 읽히는 편이 되묻는 데 낫다.
  if (tail.length >= FROM_MAX) return employeeNo.slice(0, FROM_MAX);
  const room = FROM_MAX - tail.length;
  return `${name.slice(0, Math.max(room, 0))}${tail}`.slice(0, FROM_MAX);
}

/**
 * 받는 쪽은 **첫 줄을 업무 제목으로 쓰고 60자에서 자른다.** 그 한 줄이 보드에서 이 카드를
 * 알아보는 유일한 단서라, 태그와 사용자 첫 줄을 함께 둔다. 태그만 두면 제목이 전부
 * "[자금팀 26번]" 으로 같아져 구분이 안 된다.
 *
 * 첫 줄이 제목과 메모에 두 번 나오는 것은 의도한 중복이다 — 받는 쪽이 본문 전체를 메모로
 * 남기므로, 원문을 온전히 보존하려면 이 편이 안전하다.
 */
export function composeBody(args: {
  body: string;
  sourcePath: string | null;
  problem: { id: number; type: string; sourceNumber: number | null; departmentName: string } | null;
}): string {
  const { body, sourcePath, problem } = args;
  // 부서명은 varchar(100) 이라 그대로 넣으면 태그만으로 60자를 넘을 수 있고, 그러면
  // 사용자 첫 줄이 들어갈 자리가 없어 제목이 태그뿐인 상태가 된다("보드에서 구분이
  // 안 된다"). 태그 안에서 부서명 쪽을 미리 줄여 첫 줄이 들어갈 최소한의 자리를 남긴다.
  const DEPT_NAME_MAX = 30;
  const tag = problem
    ? `[${problem.departmentName.slice(0, DEPT_NAME_MAX)} ${problem.sourceNumber === null ? "번호없음" : `${problem.sourceNumber}번`}]`
    : sourcePath?.startsWith("/admin")
      ? "[관리자]"
      : "[학습]";

  // 태그를 먼저 확보하고 남는 자리에 사용자 첫 줄을 넣는다. 통째로 잘라 버리면
  // "[자금팀 26..." 처럼 태그가 깨져 보드에서 아무 뜻이 없어진다.
  const firstLine = body.split("\n")[0].trim();
  const room = TITLE_MAX - tag.length - 1;
  const title = room > 0 ? `${tag} ${firstLine.slice(0, room)}` : tag.slice(0, TITLE_MAX);

  const context: string[] = [];
  if (problem) {
    const number = problem.sourceNumber === null ? "번호 없음" : `${problem.sourceNumber}번`;
    const label = TYPE_LABEL[problem.type] ?? problem.type;
    context.push(`문제 ${problem.id} · ${label} · ${problem.departmentName} ${number}`);
  }
  if (sourcePath) context.push(`화면: ${sourcePath}`);

  const head = [title, "", ...context, ...(context.length > 0 ? [""] : [])].join("\n");
  // 넘치면 원문 끝을 자른다. 머리말을 자르면 문제 참조가 사라져 카드가 쓸모없어진다.
  return `${head}${body}`.slice(0, FEEDBACK_MAX_BODY);
}
