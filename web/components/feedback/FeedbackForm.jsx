"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
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
 * onSent 는 성공했을 때만 부른다. 모달은 onClose 를 넘겨 닫게 하고, 관리자 화면처럼 닫을 것이
 * 없는 곳은 넘기지 않는다 — 두 경우 모두 글을 비우고 토스트를 띄우는 것은 똑같다.
 */
export default function FeedbackForm({ problemId = null, sending, setSending, onSent }) {
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  /**
   * 성공하면 글을 비우고 토스트로 알린 뒤 onSent 가 있으면 부른다 (모달이면 닫는 동작).
   * 실패하면 **비우지도, onSent 를 부르지도 않는다.** 방금 쓴 글이 사라지는 것이 이 기능에서
   * 가장 나쁜 일이다.
   */
  async function handleSubmit() {
    setSending(true);
    try {
      const r = await sendFeedback({ body: text, problemId, sourcePath: pathname });
      if (r.ok) {
        setText("");
        setMessage("");
        toast.success(r.message);
        onSent?.();
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
    <div>
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
        <Button onClick={handleSubmit} loading={sending} disabled={sending || text.trim() === ""}>보내기</Button>
      </div>
    </div>
  );
}
