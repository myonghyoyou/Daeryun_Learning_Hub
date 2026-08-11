import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ArrowLeft, CheckCircle, XCircle } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import SolveShell from "@/pages/solve/SolveShell.jsx";
import { getSolveProblem, submitAttempt } from "@/api/solve.js";
import { resolveErrorMessage } from "@/api/client.js";
import { parseBlankContent } from "@/utils/blankContent.js";

const CHOICE_TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "OX"];

export default function ProblemSolvePage() {
  const { id } = useParams();
  const [problem, setProblem] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedChoiceIds, setSelectedChoiceIds] = useState([]);
  const [submittedText, setSubmittedText] = useState("");
  const [blankInputs, setBlankInputs] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setProblem(null);
    setLoadError(false);
    setResult(null);
    setSelectedChoiceIds([]);
    setSubmittedText("");
    setBlankInputs({});
    getSolveProblem(id)
      .then(setProblem)
      .catch((error) => {
        setLoadError(true);
        toast.error(resolveErrorMessage(error, "문제를 불러오지 못했습니다."));
      });
  }, [id]);

  const revealedAnswers = useMemo(() => {
    if (!problem || problem.type !== "FILL_BLANK") return {};
    return Object.fromEntries((problem.revealedBlanks ?? []).map((b) => [b.blankKey, b.answerText]));
  }, [problem]);

  if (loadError) {
    return (
      <SolveShell>
        <Surface className="p-0">
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-body font-semibold text-ink-strong">문제를 불러오지 못했습니다.</p>
            <Link to="/solve/problems" className={""}>
              <Button variant="secondary" size="sm">목록으로</Button>
            </Link>
          </div>
        </Surface>
      </SolveShell>
    );
  }

  if (!problem) {
    return (
      <SolveShell>
        <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>
      </SolveShell>
    );
  }

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
      setResult(await submitAttempt(id, payload));
    } catch (error) {
      toast.error(resolveErrorMessage(error, "제출에 실패했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  const answered = result !== null;

  return (
    <SolveShell>
      <Link to="/solve/problems" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        문제 목록
      </Link>

      <Surface className="p-5 md:p-6">
        {problem.imageUrl && (
          <img src={problem.imageUrl} alt="문제 이미지" className="mb-4 max-h-60 rounded-md border border-line-default" />
        )}
        {problem.referenceText && (
          <p className="mb-4 whitespace-pre-wrap rounded-md bg-surface-subtle p-3 text-body-small text-ink-default">
            {problem.referenceText}
          </p>
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
                  className="mx-1 inline-block w-28 rounded-sm border-0 border-b-2 border-brand-blue bg-surface-blue px-1 py-0.5 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60"
                  value={blankInputs[segment.blankKey] ?? ""}
                  onChange={(event) => setBlankInputs({ ...blankInputs, [segment.blankKey]: event.target.value })}
                />
              );
            })}
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-strong">{problem.content}</p>
        )}

        {CHOICE_TYPES.includes(problem.type) && (
          <ul className="mt-5 space-y-2">
            {problem.choices.map((choice) => {
              const selected = selectedChoiceIds.includes(choice.id);
              return (
                <li key={choice.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-body transition-colors ${
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
            className="mt-5 h-[38px] w-full rounded-sm border border-line-default bg-surface-default px-3 text-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60"
            placeholder="답안을 입력하세요"
            value={submittedText}
            onChange={(event) => setSubmittedText(event.target.value)}
          />
        )}

        {!answered && (
          <div className="mt-6">
            <Button onClick={handleSubmit} loading={submitting} size="lg">제출</Button>
          </div>
        )}
      </Surface>

      {answered && (
        <Surface className={`mt-4 p-5 ${result.correct ? "bg-success-bg" : "bg-danger-bg"}`}>
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
          <div className="mt-4">
            <Link to="/solve/problems">
              <Button variant="secondary" size="sm">다른 문제 풀기</Button>
            </Link>
          </div>
        </Surface>
      )}
    </SolveShell>
  );
}
