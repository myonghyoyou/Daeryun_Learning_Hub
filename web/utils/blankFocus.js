/**
 * 화면에 그려진 순서대로 빈칸 키를 뽑는다. parseBlankContent 가 낸 조각을 받는다.
 *
 * **problem.blanksToAnswer 를 칸 차례로 쓰면 안 된다.** 서버가 출제할 빈칸을 무작위로
 * 섞어 내려주기 때문이다(lib/solve/solveQueryService.ts 의 selectRandomBlankKeys).
 * 화면의 차례는 본문을 훑으며 마커를 만난 순서라 둘이 다르다 — 섞인 목록으로 "다음 칸"을
 * 정하면 첫 칸에서 누른 엔터가 곧바로 제출이 된다(2026-09-04 기획팀 29번에서 실측).
 */
export function blankOrderFrom(segments) {
  return (segments ?? []).filter((s) => s.type === "input").map((s) => s.blankKey);
}

/**
 * 빈칸 채우기에서 엔터를 눌렀을 때 무엇을 할지 정한다.
 *
 * 엔터는 "다음 칸"이고, **마지막 칸에서만 제출**이다. 어느 칸에서든 바로 제출하면
 * 빈칸이 셋인 문제에서 첫 칸만 치고 엔터를 눌렀을 때 나머지를 빈 채 내게 된다.
 *
 * 칸의 차례는 화면에 그려진 순서(problem.blanksToAnswer)를 그대로 쓴다.
 */
export function resolveEnter(keys, currentKey) {
  const index = (keys ?? []).indexOf(currentKey);
  // 모르는 칸이면 아무것도 하지 않는다. 제출로 넘기면 화면과 정답 목록이 어긋난
  // 상황에서 사용자가 의도하지 않은 제출을 하게 된다.
  if (index < 0) return { action: "none" };
  if (index === keys.length - 1) return { action: "submit" };
  return { action: "focus", key: keys[index + 1] };
}
