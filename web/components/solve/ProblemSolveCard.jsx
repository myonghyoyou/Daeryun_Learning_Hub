"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import SourceBadge from "@/components/ui/SourceBadge.jsx";
import { CHOICE_LIST_CLASS, CHOICE_ITEM_MIN_HEIGHT, SUBMIT_AREA_CLASS } from "@/components/solve/choiceLayout.js";
import { submitAttempt } from "@/apiClient/solve.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { parseBlankContent } from "@/utils/blankContent.js";
import { blankOrderFrom, resolveEnter } from "@/utils/blankFocus.js";
import { splitAnswerBlanks } from "@/utils/answerBlank.js";
import { blankHostField, blankHostText } from "@/lib/problem/blankHost";
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
  // 빈칸 입력칸을 키로 들고 있다가 엔터로 다음 칸에 포커스를 옮길 때 쓴다.
  const blankRefs = useRef({});

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

  // 빈칸 마커가 본문에 있는지 지문에 있는지. 참조지문이 있으면 거기가 집이다(blankHost.ts).
  const blanksLiveInContent =
    problem.type === "FILL_BLANK" && blankHostField(problem.referenceText) === "content";

  /**
   * 화면에 그려진 칸 차례. 엔터가 "다음 칸"을 찾을 때 쓴다.
   *
   * problem.blanksToAnswer 를 쓰면 안 된다 — 서버가 섞어 내려주므로 화면 차례와 다르다
   * (utils/blankFocus.js 의 blankOrderFrom 주석).
   */
  const blankOrder = useMemo(() => {
    if (problem.type !== "FILL_BLANK") return [];
    const hostText = blankHostText(problem.content, problem.referenceText);
    return blankOrderFrom(parseBlankContent(hostText, problem.blanksToAnswer ?? [], revealedAnswers));
  }, [problem, revealedAnswers]);

  /**
   * 엔터를 제출로 받을 수 있는 상태인지. 제출 버튼과 같은 조건을 쓴다 — 버튼이 잠겨
   * 있는데 엔터로는 낼 수 있으면 두 길이 어긋난다.
   *
   * **한글 조합 중(isComposing)에는 받지 않는다.** 조합을 끝내는 엔터까지 제출로 세면,
   * 마지막 글자를 확정하려고 누른 엔터에 답이 나가 버린다.
   */
  function isSubmitEnter(event) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return false;
    return !answered && !submitting && !nothingEntered;
  }

  function handleShortAnswerKeyDown(event) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (isSubmitEnter(event)) handleSubmit();
  }

  /**
   * 빈칸에서의 엔터. 다음 칸으로 옮기고, **마지막 칸에서만** 제출한다.
   *
   * 다음 칸으로 옮기는 것은 아직 아무것도 안 썼을 때도 되어야 한다 — 건너뛰며 훑는
   * 사람이 있다. 그래서 옮기기는 isSubmitEnter 조건을 보지 않는다.
   */
  function handleBlankKeyDown(event, blankKey) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const next = resolveEnter(blankOrder, blankKey);
    if (next.action === "focus") {
      blankRefs.current[next.key]?.focus();
      return;
    }
    if (next.action === "submit" && isSubmitEnter(event)) handleSubmit();
  }

  /**
   * 본문의 빈 괄호 `( )` 를 답 적는 자리처럼 그린다.
   *
   * 괄호 모양을 그대로 두고 색과 안쪽 점선만 더한다. 밑줄 칸으로 바꾸면 빈칸 채우기의
   * 진짜 입력칸(renderWithBlanks)과 색·밑줄이 같아져, 칠 수 없는 자리를 치려 든다.
   *
   * 안쪽 상자는 1.15em 이라 22px 줄 상자 안에 들어간다 — 입력칸처럼 줄 간격을 밀어내지
   * 않으므로 이 문단은 leading-relaxed 그대로 둔다. 괄호와 점선이 줄바꿈에서 갈라지지
   * 않도록 한 덩어리로 묶는다.
   *
   * 점선만 남기면 화면 낭독기가 아무것도 읽지 않으므로 "빈칸"을 숨은 글자로 넣는다.
   */
  function renderAnswerBlanks(text) {
    return splitAnswerBlanks(text).map((segment, index) => {
      if (segment.type === "text") return <span key={index}>{segment.value}</span>;
      return (
        <span key={index} className="mx-px whitespace-nowrap">
          <span className="font-bold text-brand-blue">(</span>
          <span
            aria-hidden="true"
            className="mx-0.5 inline-block h-[1.15em] w-[54px] border-b border-dashed border-line-strong align-[-0.22em]"
          />
          <span className="sr-only">빈칸</span>
          <span className="font-bold text-brand-blue">)</span>
        </span>
      );
    });
  }

  /**
   * 빈칸 마커가 든 글을 입력칸이 섞인 문단으로 그린다.
   *
   * 본문과 지문 두 자리에서 같은 모양이 필요하므로 함수로 둔다 — 자리마다 복사하면
   * 한쪽만 고쳐지는 사고가 난다.
   *
   * 입력칸의 포커스 링은 outline-offset 을 음수로 둬 테두리 안쪽에 그린다. 빈칸이
   * 줄바꿈 중간에 오면 윗줄·아랫줄과의 간격이 실측 1px대로 촘촘한데(각 줄의
   * line-height 는 입력칸 자체 높이와 거의 같다), outline-offset-2(양수)를 쓰면
   * 링이 박스 밖으로 최대 5px 번져 위아래 줄 글자를 가린다. offset 을 outline-width
   * 와 같은 크기의 음수로 주면 링이 절대 박스 밖으로 안 나가 줄 간격과 무관하게
   * 안전하다 — SolveTeamListPage.jsx 의 촘촘한 목록 행이 쓰는 것과 같은 장치다.
   */
  function renderWithBlanks(text) {
    return parseBlankContent(text, problem.blanksToAnswer, revealedAnswers).map((segment, index) => {
      if (segment.type === "text") return <span key={index}>{segment.value}</span>;
      if (segment.type === "reveal") {
        return <strong key={index} className="font-semibold text-ink-strong">{segment.value}</strong>;
      }
      return (
        <input
          key={index}
          ref={(el) => {
            blankRefs.current[segment.blankKey] = el;
          }}
          onKeyDown={(event) => handleBlankKeyDown(event, segment.blankKey)}
          aria-label={`빈칸 ${segment.blankKey}`}
          disabled={answered}
          className="mx-1 inline-block w-28 rounded-sm border-0 border-b-2 border-brand-blue bg-surface-blue px-1 text-center py-0.5 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-aqua disabled:opacity-60"
          value={blankInputs[segment.blankKey] ?? ""}
          onChange={(event) => setBlankInputs({ ...blankInputs, [segment.blankKey]: event.target.value })}
        />
      );
    });
  }

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

        {/*
          질문이 먼저, 지문은 그 아래 테두리 박스. 빈칸 마커는 지문이 있으면 지문 쪽에 있으므로
          (lib/problem/blankHost.ts) 입력칸도 그 글을 그리는 자리에서 나온다 — 두 자리 모두
          renderWithBlanks 를 쓰므로 어느 쪽에 있든 같은 모양으로 그려진다.
        */}
        {blanksLiveInContent ? (
          <p className="text-body leading-loose text-ink-strong">{renderWithBlanks(problem.content)}</p>
        ) : (
          <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-strong">{renderAnswerBlanks(problem.content)}</p>
        )}

        {problem.referenceText && (
          <div className="mt-4 rounded-md border border-line-default bg-surface-subtle p-4">
            {problem.type === "FILL_BLANK" ? (
              <p className="text-body leading-loose text-ink-strong">{renderWithBlanks(problem.referenceText)}</p>
            ) : (
              <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-default">{renderAnswerBlanks(problem.referenceText)}</p>
            )}
          </div>
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
                    className={`solve-choice flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-body focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-brand-aqua ${CHOICE_ITEM_MIN_HEIGHT} ${
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
            onKeyDown={handleShortAnswerKeyDown}
            disabled={answered}
            className="mt-5 h-[44px] w-full rounded-sm border border-line-default bg-surface-default px-3 text-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60"
            placeholder="답안을 입력하세요"
            value={submittedText}
            onChange={(event) => setSubmittedText(event.target.value)}
          />
        )}

        {/*
          답을 내고 나서도 DOM 에서 지우지 않는다. 지우면 아래 결과 카드가 튀어 오르는데,
          자리를 접으면서 흐려지게 하려면 요소가 남아 있어야 한다.
          inert 는 접히는 동안 버튼이 눌리거나 화면 낭독기에 읽히는 것을 막는다.
        */}
        <div className={`${SUBMIT_AREA_CLASS} solve-submit`} data-gone={answered ? "true" : "false"} inert={answered}>
          <Button onClick={handleSubmit} loading={submitting} disabled={nothingEntered} size="lg" className="w-full sm:w-auto">
            제출
          </Button>
          {nothingEntered && (
            <p className="mt-2 text-body-small text-ink-muted">답안을 입력하면 제출할 수 있습니다.</p>
          )}
        </div>
      </Surface>

      {answered && (
        <Surface background={result.correct ? "bg-success-bg" : "bg-danger-bg"} className="solve-result mt-4 p-5">
          <p className={`flex items-center gap-2 text-section-title font-bold ${result.correct ? "text-success-text" : "text-danger-text"}`}>
            {/*
              튐은 맞혔을 때만이다. 틀렸을 때 흔드는 관용구를 쓰지 않는 것과 같은 이유로 —
              한 바퀴에 수십 번 나오는 자리에서 강조는 나무람으로 읽힌다. 색과 아이콘이면 충분하다.
            */}
            {result.correct ? <CheckCircle size={20} weight="fill" aria-hidden="true" className="solve-tick" /> : <XCircle size={20} weight="fill" aria-hidden="true" />}
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
          {!result.correct && !result.blankResults && result.correctAnswerSummary && (
            <p className="mt-3 text-body-small text-ink-default">
              <span className="font-medium text-ink-strong">정답: </span>
              {result.correctAnswerSummary}
            </p>
          )}
        </Surface>
      )}
    </>
  );
}
