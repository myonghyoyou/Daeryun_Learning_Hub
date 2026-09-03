/**
 * 팀 목록 한 줄의 상태 문구.
 *
 * 끝난 바퀴에 "다 풀었음"이나 마지막 성적을 적지 않는 이유가 있다. 중간에 그만둔 바퀴도
 * 끝난 바퀴라 "다 풀었음"은 사실과 다를 수 있고, 마지막 성적을 적으면 복습 바퀴가
 * 마지막일 때 분모가 팀 전체와 달라져("5 / 8") 무슨 숫자인지 알 수 없다. 지금 틀린 문제
 * 수는 어느 바퀴를 마지막에 돌았든 뜻이 같고, 복습 버튼을 눌렀을 때 나올 개수와 정확히
 * 일치한다.
 */
export function teamStateLabel(team) {
  if (team.activeRun) {
    // "12 / 30" 으로 적지 않는다. 진행 화면이 같은 모양으로 **지금 몇 번째 문제인지**를
    // 적기 때문에(1문제를 풀었으면 거기는 "2 / 30"), 나란히 놓으면 같은 상태가 다른
    // 숫자로 보인다. 여기서 세는 것은 위치가 아니라 푼 개수다.
    return { text: `${team.activeRun.cursor}문제 풀었음`, kind: "progress" };
  }
  if (team.hasFinishedRun) {
    return { text: `틀린 문제 ${team.wrongCount}개`, kind: "wrong" };
  }
  return { text: "아직 안 풂", kind: "none" };
}
