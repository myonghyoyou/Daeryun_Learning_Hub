"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal.jsx";
import FeedbackForm from "@/components/feedback/FeedbackForm.jsx";

/**
 * 문제 카드 · 학습 홈 · 셸 하단의 세 진입점이 함께 쓰는 모달 껍데기.
 * 실제 폼(입력·전송 로직)은 FeedbackForm 이 들고 있고, 여기서는 Modal 로 감싸고
 * 제목을 붙이고 보내는 동안 dismissible={false} 로 잠그는 일만 한다.
 */
export default function FeedbackModal({ open, onClose, problemId = null }) {
  const [sending, setSending] = useState(false);

  return (
    <Modal open={open} title={problemId ? "이 문제 신고" : "의견 보내기"} onClose={onClose} dismissible={!sending}>
      <FeedbackForm problemId={problemId} sending={sending} setSending={setSending} onSent={onClose} />
    </Modal>
  );
}
