// 계정 목록의 "최근 로그인" 컬럼 표기. lastLoginAt은 ISO datetime이거나 null이다
// (UserListItem 참고) — null은 로그인 이력이 없다는 뜻이므로 빈 값 대신 문구로 안내한다.
export function formatLastLogin(lastLoginAt) {
  if (!lastLoginAt) {
    return "로그인 이력 없음";
  }
  return new Date(lastLoginAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
