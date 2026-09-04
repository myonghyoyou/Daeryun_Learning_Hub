/**
 * 채점 결과(blankResults)를 blankKey 로 찾을 수 있게 묶는다.
 *
 * **차례로 짝지으면 안 된다.** 서버는 출제할 빈칸을 섞어 내려주고
 * (lib/solve/solveQueryService.ts 의 selectRandomBlankKeys 는 "shuffle 후 앞에서 count 개"다),
 * 화면은 그 섞인 차례 그대로 제출한다. 서버는 받은 차례로 결과를 돌려주므로
 * blankResults 의 차례는 문장에 빈칸이 나온 차례와 다르다.
 *
 * 그래서 n 번째 빈칸에 n 번째 결과를 붙이면 정답이 엉뚱한 칸에 실린다. 빈칸이 하나일 때는
 * 드러나지 않아 오래 숨어 있었다 — 엔터 키가 첫 칸에서 바로 제출되던 결함과 같은 뿌리다.
 */
export function revealMapFrom(blankResults) {
  return Object.fromEntries((blankResults ?? []).map((b) => [b.blankKey, b]));
}
