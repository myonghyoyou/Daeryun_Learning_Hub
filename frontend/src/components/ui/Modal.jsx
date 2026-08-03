import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";

/**
 * 접근성 규칙(10): Modal이 열리면 포커스를 내부로 이동하고, 닫히면 원래 트리거로 반환한다.
 * 비활성화 확인처럼 대상명·영향·취소·확정 버튼을 담는 용도로 부서/계정 관리 화면이 공유한다.
 *
 * dismissible=false일 때는 배경 클릭·Esc·X 버튼을 모두 막는다. 취소할 수 없는
 * 요청(예: 상태 변경 API 호출 중)이 진행되는 동안 사용자가 이 Modal을 닫고 다른
 * 대상의 확인 Modal을 새로 열 수 있게 두면, 먼저 보낸 요청의 응답이 나중에
 * 도착했을 때 그 stale closure가 나중에 연 Modal을 실수로 닫아버리는 경쟁 상태가
 * 생긴다. 진행 중에는 아예 닫을 방법을 없애 그 경쟁 상태 자체를 차단한다.
 */
export default function Modal({ open, title, onClose, children, dismissible = true }) {
  const dialogRef = useRef(null);
  const triggerElementRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    triggerElementRef.current = document.activeElement;
    dialogRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && dismissible) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerElementRef.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  function handleBackdropClick() {
    if (dismissible) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,43,76,0.4)] px-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-line-default bg-surface-default p-6 shadow-raised focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-section-title font-bold text-ink-strong">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="닫기"
            className="text-ink-muted hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
