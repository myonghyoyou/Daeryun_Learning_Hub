"use client";
import { useCallback, useEffect, useState } from "react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import FeedbackForm from "@/components/feedback/FeedbackForm.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { listUnsentFeedbacks, retryFeedbacks } from "@/apiClient/feedback.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

export default function FeedbackPage() {
  const { session } = useSessionStatus();
  const isSuper = session?.role === "SUPER_ADMIN";
  const [sending, setSending] = useState(false);
  const [unsent, setUnsent] = useState([]);
  const [retrying, setRetrying] = useState(false);
  const [note, setNote] = useState("");

  // 총괄 관리자만 부른다 — 부서 관리자가 부르면 서버가 막지만, 막힐 요청을 보내지 않는다.
  const refresh = useCallback(async () => {
    if (!isSuper) return;
    try {
      setUnsent(await listUnsentFeedbacks());
    } catch (error) {
      setNote(resolveErrorMessage(error, "목록을 불러오지 못했습니다."));
    }
  }, [isSuper]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const r = await retryFeedbacks();
      setNote(
        r.stoppedByLimit
          ? `${r.sent}건을 보냈고 한도에 걸려 멈췄습니다. 잠시 뒤 다시 눌러 주세요.`
          : `${r.tried}건 중 ${r.sent}건을 보냈습니다.`,
      );
      await refresh();
    } catch (error) {
      setNote(resolveErrorMessage(error, "다시 보내지 못했습니다."));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <section className="mb-5">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">피드백</h1>
        <p className="mt-1 text-body text-ink-default">제작자에게 바라는 점이나 불편한 점을 보냅니다.</p>
      </section>

      <Surface className="p-5">
        {/* onResult: 총괄 관리자 자신의 피드백이 실패해도 새 FAILED 행이 생기므로,
            성공·실패 상관없이 목록을 새로 고쳐 위 건수가 바로 맞게 한다. */}
        <FeedbackForm sending={sending} setSending={setSending} onResult={refresh} />
      </Surface>

      {isSuper && (
        <Surface className="mt-4 p-5">
          <div className="flex items-center justify-between gap-3">
            {/* 목록 조회는 최대 100건까지만 가져온다(findUnsentSummary) — 그 이상이면 건수가
                실제보다 적어 보일 수 있으므로 "최근 100건 중"임을 라벨에 밝힌다. */}
            <p className="text-body text-ink-strong">
              전달 실패 (최근 100건 중) <span className="font-bold">{unsent.length}</span>건
            </p>
            <Button variant="secondary" onClick={handleRetry} loading={retrying} disabled={unsent.length === 0}>
              다시 보내기
            </Button>
          </div>
          {note && <p aria-live="polite" className="mt-2 text-body-small text-ink-default">{note}</p>}
          {/*
            본문은 보이지 않는다. 다시 보내기에 필요한 것은 건수와 상태뿐인데, 본문을 띄우면
            총괄 관리자가 전 직원의 의견 원문을 읽게 된다. 원문을 볼 자리는 제작자의 보드다.
          */}
          {unsent.length > 0 && (
            <ul className="mt-3 space-y-2">
              {unsent.map((f) => (
                <li key={f.id} className="flex items-baseline gap-3 rounded-md border border-line-default p-3 text-body-small">
                  <span className="text-ink-strong">{f.status}{f.failReason ? ` · ${f.failReason}` : ""}</span>
                  <span className="ml-auto text-ink-muted">시도 {f.attemptCount}회</span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}
    </>
  );
}
