"use client";
import Modal from "@/components/ui/Modal.jsx";
import Button from "@/components/ui/Button.jsx";
import { canDismissConfirmModal } from "@/utils/modalDismissal.js";

/**
 * 활성화/비활성화(그리고 Plan 3에서는 보관/복원) 같은 상태 토글 확인 Modal의 공통 뼈대
 * (8.6.3 "삭제·보관·비활성화: 확인 Modal에서 대상명·영향·취소·확정 버튼을 명시"). 대상명·
 * 영향 문구·버튼 라벨·색상은 도메인마다 달라 caller가 채우고, dismissible 경쟁 상태 차단
 * (canDismissConfirmModal — 진행 중인 요청의 Modal을 닫고 다른 대상의 Modal을 여는 경쟁
 * 상태 차단)과 버튼 배치는 여기서 한 번만 구현해 DepartmentListPage/UserListPage가 재사용한다.
 *
 * caller는 target이 null일 수 있는 값들(title/message/confirmLabel/confirmVariant/pendingId)을
 * 옵셔널 체이닝이나 `target && (...)`로 안전하게 계산해 넘겨야 한다 — 이 컴포넌트는 그 값을
 * 그대로 렌더링만 하며 target 자체를 들여다보지 않는다.
 */
export default function ConfirmToggleModal({
  open,
  pendingId,
  togglingId,
  title,
  message,
  confirmLabel,
  confirmVariant = "destructive",
  cancelLabel = "취소",
  onCancel,
  onConfirm,
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} dismissible={canDismissConfirmModal({ pendingId, togglingId })}>
      <div className="space-y-4">
        <p className="text-body text-ink-default">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={togglingId === pendingId} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} loading={togglingId === pendingId} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
