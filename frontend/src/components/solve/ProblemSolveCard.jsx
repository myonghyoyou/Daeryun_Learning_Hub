import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import Collapsible from "@/components/ui/Collapsible.jsx";
import SourceBadge from "@/components/ui/SourceBadge.jsx";
import { CHOICE_LIST_CLASS, CHOICE_ITEM_MIN_HEIGHT, SUBMIT_AREA_CLASS } from "@/components/solve/choiceLayout.js";
import { submitAttempt } from "@/api/solve.js";
import { resolveErrorMessage } from "@/api/client.js";
import { parseBlankContent } from "@/utils/blankContent.js";
import { hasNoAnswer } from "@/utils/answerState.js";
import { problemTypeLabel } from "@/utils/problemLabels.js";

const CHOICE_TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "OX"];

/**
 * 문제 하나를 렌더하고 답 입력·제출·채점 결과 표시를 담당하는 표현 컴포넌트.
 * 단건 풀이 화면(/solve/:id)과 랜덤 세트 진행 화면이 함께 쓴다.
 */
export default function ProblemSolveCard({ problem, onSubmitted }) {
  const [selectedChoiceIds, setSelectedChoiceIds] = useState([]);
  const [submittedText, setSubmittedText] = useState("");
  const [blankInputs, setBlankInputs] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelectedChoiceIds([]);
    setSubmittedText("");
    setBlankInputs({});
    setResult(null);
  }, [problem.id]);

  const revealedAnswers = useMemo(() => {
    if (problem.type !== "FILL_BLANK") return {};
    return Object.fromEntries((problem.revealedBlanks ?? []).map((b) => [b.blankKey, b.answerText]));
  }, [problem]);

  function toggleChoice(choiceId) {
    if (problem.type === "MCQ_MULTI") {
      setSelectedChoiceIds((prev) =>
        prev.includes(choiceId) ? prev.filter((c) => c !== choiceId) : [...prev, choiceId]
      );
    } else {
      setSelectedChoiceIds([choiceId]);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      let payload = {};
      if (problem.type === "SHORT_ANSWER") {
        payload = { submittedText };
      } else if (problem.type === "FILL_BLANK") {
        payload = {
          blankAnswers: problem.blanksToAnswer.map((key) => ({ blankKey: key, submittedAnswer: blankInputs[key] ?? "" })),
        };
      } else {
        payload = { selectedChoiceIds };
      }
      const submitted = await submitAttempt(problem.id, payload);
      setResult(submitted);
      if (onSubmitted) {
        onSubmitted(submitted);
      }
    } catch (error) {
      toast.error(resolveErrorMessage(error, "제출에 실패했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  const answered = result !== null;

  const nothingEntered = hasNoAnswer({
    type: problem.type,
    selectedChoiceIds,
    submittedText,
    blankInputs,
    blanksToAnswer: problem.blanksToAnswer,
  });

  return (
    <>
      <Surface className="p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-surface-blue px-2.5 py-1 text-body-small font-medium text-info-text">
            {problemTypeLabel(problem.type)}
          </span>
          <SourceBadge item={problem} />
        </div>

        {problem.imageUrl && (
          <img src={problem.imageUrl} alt="문제 이미지" className="mb-4 max-h-60 rounded-md border border-line-default" />
        )}
        {problem.referenceText && (
          <div className="mb-4 rounded-md bg-surface-subtle p-3 text-body-small text-ink-default">
            <Collapsible text={problem.referenceText} />
          </div>
        )}

        {problem.type === "FILL_BLANK" ? (
          <p className="text-body leading-loose text-ink-strong">
            {parseBlankContent(problem.content, problem.blanksToAnswer, revealedAnswers).map((segment, index) => {
              if (segment.type === "text") return <span key={index}>{segment.value}</span>;
              if (segment.type === "reveal") return <strong key={index} className="font-semibold text-ink-strong">{segment.value}</strong>;
              return (
                <input
                  key={index}
                  aria-label={`빈칸 ${segment.blankKey}`}
                  disabled={answered}
                  className="mx-1 inline-block w-28 rounded-sm border-0 border-b-2 border-brand-blue bg-surface-blue px-1 text-center py-0.5 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60"
                  value={blankInputs[segment.blankKey] ?? ""}
                  onChange={(event) => setBlankInputs({ ...blankInputs, [segment.blankKey]: event.target.value })}
                />
              );
            })}
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-strong">{problem.content}</p>
        )}

        {problem.type === "FILL_BLANK" && (
          <p className="mt-3 text-body-small text-ink-muted">
            빈칸 {problem.blanksToAnswer.length}개 중{" "}
            {problem.blanksToAnswer.filter((key) => (blankInputs[key] ?? "").trim()).length}개 입력
          </p>
        )}

        {CHOICE_TYPES.includes(problem.type) && (
          <ul className={CHOICE_LIST_CLASS}>
            {problem.choices.map((choice) => {
              const selected = selectedChoiceIds.includes(choice.id);
              return (
                <li key={choice.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-body transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-brand-aqua ${CHOICE_ITEM_MIN_HEIGHT} ${
                      selected ? "border-brand-blue bg-selection-bg text-ink-strong" : "border-line-default bg-surface-default text-ink-default hover:bg-surface-subtle"
                    } ${answered ? "cursor-default opacity-70" : ""}`}
                  >
                    <input
                      type={problem.type === "MCQ_MULTI" ? "checkbox" : "radio"}
                      name="choice"
                      className="h-4 w-4 accent-brand-blue"
                      checked={selected}
                      disabled={answered}
                      onChange={() => toggleChoice(choice.id)}
                    />
                    {choice.text}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {problem.type === "SHORT_ANSWER" && (
          <input
            aria-label="주관식 답안"
            disabled={answered}
            className="mt-5 h-[44px] w-full rounded-sm border border-line-default bg-surface-default px-3 text-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60"
            placeholder="답안을 입력하세요"
            value={submittedText}
            onChange={(event) => setSubmittedText(event.target.value)}
          />
        )}

        {!answered && (
          <div className={SUBMIT_AREA_CLASS}>
            <Button onClick={handleSubmit} loading={submitting} disabled={nothingEntered} size="lg" className="w-full sm:w-auto">
              제출
            </Button>
            {nothingEntered && (
              <p className="mt-2 text-body-small text-ink-muted">답안을 입력하면 제출할 수 있습니다.</p>
            )}
          </div>
        )}
      </Surface>

      {answered && (
        <Surface background={result.correct ? "bg-success-bg" : "bg-danger-bg"} className="mt-4 p-5">
          <p className={`flex items-center gap-2 text-section-title font-bold ${result.correct ? "text-success-text" : "text-danger-text"}`}>
            {result.correct ? <CheckCircle size={20} weight="fill" aria-hidden="true" /> : <XCircle size={20} weight="fill" aria-hidden="true" />}
            {result.correct ? "정답입니다!" : "오답입니다."}
          </p>
          {result.explanation && <p className="mt-2 whitespace-pre-wrap text-body text-ink-default">{result.explanation}</p>}
          {result.blankResults && (
            <ul className="mt-3 space-y-1 text-body-small">
              {result.blankResults.map((b) => (
                <li key={b.blankKey} className="text-ink-default">
                  <span className="font-medium text-ink-strong">{b.submittedAnswer || "(미입력)"}</span>{" "}
                  {b.correct ? (
                    <span className="text-success-text">정답</span>
                  ) : (
                    <span className="text-danger-text">오답 · 정답은 {b.correctAnswer}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}
    </>
  );
}
