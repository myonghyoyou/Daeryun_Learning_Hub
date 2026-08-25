/**
 * 확인 Modal(예: 부서 비활성화/활성화)이 배경 클릭·Esc·닫기 버튼으로 닫힐 수
 * 있는지를 결정하는 순수 술어. 취소할 수 없는 요청이 진행 중인 동안(togglingId가
 * 그 대상의 id와 일치하는 동안)에는 닫을 수 없게 해, 사용자가 진행 중인 요청의
 * Modal을 닫고 다른 대상의 Modal을 새로 여는 경쟁 상태를 원천 차단한다.
 */
export function canDismissConfirmModal({ pendingId, togglingId }) {
  if (togglingId === null || togglingId === undefined) {
    return true;
  }
  return togglingId !== pendingId;
}
