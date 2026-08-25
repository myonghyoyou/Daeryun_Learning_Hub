"use client";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";

/**
 * 관리자 목록 화면(부서 관리·계정 관리, 그리고 Plan 3 문제 은행 목록도 같은 모양이 될 것)이
 * 공유하는 로딩/오류/빈 목록/데이터 네 상태 전환 뼈대(8.6.3). DepartmentListPage와
 * UserListPage가 각각 거의 동일한 마크업(aria-live Surface + 상태별 분기)을 복제하고
 * 있어서 이 컴포넌트로 뽑았다. 실제 목록 마크업(DataTable 등)은 children으로 받는다.
 */
export default function ListStateSurface({
  loading,
  loadingMessage,
  error,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}) {
  return (
    <Surface>
      <div aria-live="polite">
        {loading ? (
          <p className="px-5 py-10 text-center text-body-small text-ink-muted">{loadingMessage}</p>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-body-small text-danger-text">{error}</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              다시 시도
            </Button>
          </div>
        ) : isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </div>
    </Surface>
  );
}
