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
