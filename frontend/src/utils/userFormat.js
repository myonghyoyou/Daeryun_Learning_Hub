// 계정 목록의 "최근 로그인" 컬럼 표기. lastLoginAt은 ISO datetime이거나 null이다
// (UserListItem 참고) — null은 로그인 이력이 없다는 뜻이므로 빈 값 대신 문구로 안내한다.
// timeZone을 명시적으로 Asia/Seoul로 고정해, 관리자를 보는 브라우저/서버의 로컬 시간대와
// 무관하게 항상 같은 값을 표시한다(고정하지 않으면 호스트 환경의 로컬 시간대를 따라가
// 화면마다, 또는 이 값을 검증하는 테스트마다 다른 결과가 나올 수 있다).
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
