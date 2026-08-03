import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";

/**
 * 접근성 규칙(10): Modal이 열리면 포커스를 내부로 이동하고, 닫히면 원래 트리거로 반환한다.
 * 비활성화 확인처럼 대상명·영향·취소·확정 버튼을 담는 용도로 부서/계정 관리 화면이 공유한다.
 */
export default function Modal({ open, title, onClose, children }) {
  const dialogRef = useRef(null);
  const triggerElementRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    triggerElementRef.current = document.activeElement;
    dialogRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerElementRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,43,76,0.4)] px-4"
      onClick={onClose}
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
            aria-label="닫기"
            className="text-ink-muted hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
