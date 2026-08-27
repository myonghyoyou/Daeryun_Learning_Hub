/**
 * 로그인한 사용자의 이름·역할을 보여주는 작은 정보 블록.
 * 관리자 사이드바 하단과 학습 화면 헤더가 함께 쓴다(LogoutButton과 같은 이유로 분리 — 마크업을
 * 두 곳에 복제하지 않는다). 역할 라벨은 호출부가 맥락에 맞는 매핑 함수로 미리 만들어 넘긴다
 * (관리자 쪽은 utils/adminSession.js, 학습 화면 쪽은 utils/userRole.js — 전자는 EMPLOYEE를
 * 다루지 않는다).
 */
export default function AccountInfo({ name, roleLabel, className = "" }) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <span className="truncate text-body-small font-semibold text-ink-strong">{name ?? "-"}</span>
      <span className="truncate text-body-small text-ink-muted">{roleLabel}</span>
    </div>
  );
}
