// 계정 목록의 "최근 로그인" 컬럼 표기. lastLoginAt은 ISO datetime이거나 null이다
// (UserListItem 참고) — null은 로그인 이력이 없다는 뜻이므로 빈 값 대신 문구로 안내한다.
//
// 주의(현재 동작): 백엔드는 LocalDateTime을 오프셋 없는 문자열("2026-08-03T10:15:30")로
// 직렬화한다. JS의 new Date(...)는 오프셋 없는 문자열을 "브라우저 로컬 시간"으로 해석하므로,
// 여기서 timeZone: "Asia/Seoul"을 지정해도 그것은 이미 로컬로 해석된 순간을 KST로 다시
// 변환할 뿐이다. 즉 KST가 아닌 브라우저에서는 표시 시각이 실제와 어긋난다.
// 지금은 사용자가 모두 KST 환경이라는 전제 위에서 이 표기가 성립한다. timeZone 고정은
// 그 전제 아래서 표시 형식과 테스트 결과를 호스트 로컬 시간대에 흔들리지 않게 하는 역할만 한다.
// 근본 해결은 서버가 오프셋을 포함한 타임스탬프를 보내는 것이며, 그 직렬화 계약 변경은
// Plan 5 통계 화면까지 걸치는 결정이라 이번 wave 범위 밖이다(별도 plan feedback으로 기록).
export function formatLastLogin(lastLoginAt) {
  if (!lastLoginAt) {
    return "로그인 이력 없음";
  }
  return new Date(lastLoginAt).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  });
}
