"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Modal from "@/components/ui/Modal.jsx";
import Button from "@/components/ui/Button.jsx";
import { toast } from "react-toastify";
import { sendFeedback } from "@/apiClient/feedback.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

const MAX = 1000;

/**
 * 진입점 넷이 공유하는 단 하나의 폼. 화면마다 폼을 따로 만들면 한쪽만 고쳐진다.
 *
 * value/onChange 로 글자를 직접 들고 있는다. React 19 의 form action 을 쓰면 액션이 끝날 때
 * 폼이 자동으로 비워지는데 **성공·실패를 가리지 않는다** — 실패했는데 지우면 방금 쓴 글이 사라진다.
 *
 * 보내는 동안 dismissible={false} 로 잠근다. 받는 쪽에 중복 판정이 없어 두 번 눌린 만큼
 * 카드가 생긴다.
 */
export default function FeedbackModal({ open, onClose, problemId = null }) {
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  /**
   * 성공하면 글을 비우고 모달을 닫은 뒤 토스트로 알린다 — 문제를 풀던 흐름으로 바로 돌아간다.
   * 실패하면 **닫지 않고 글도 그대로 둔다.** 방금 쓴 글이 사라지는 것이 이 기능에서
   * 가장 나쁜 일이다.
   */
  async function handleSubmit() {
    setSending(true);
    try {
      const r = await sendFeedback({ body: text, problemId, sourcePath: pathname });
      if (r.ok) {
        setText("");
        setMessage("");
        onClose();
        toast.success(r.message);
        return;
      }
      setMessage(r.message);
    } catch (error) {
      setMessage(resolveErrorMessage(error, "지금은 보낼 수 없습니다."));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} title={problemId ? "이 문제 신고" : "의견 보내기"} onClose={onClose} dismissible={!sending}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX}
        disabled={sending}
        rows={6}
        aria-label="피드백 내용"
        placeholder={problemId ? "이 문제의 어디가 이상한지 적어 주세요" : "불편한 점이나 바라는 점을 적어 주세요"}
        className="w-full rounded-sm border border-line-default bg-surface-default p-3 text-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-aqua disabled:opacity-60"
      />
      <p className="mt-1 text-right text-body-small text-ink-muted">{text.length} / {MAX}</p>
      {message && <p aria-live="polite" className="mt-2 text-body-small text-ink-default">{message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={sending}>닫기</Button>
        <Button onClick={handleSubmit} loading={sending} disabled={text.trim() === ""}>보내기</Button>
      </div>
    </Modal>
  );
}
