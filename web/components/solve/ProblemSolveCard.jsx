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
import { revealMapFrom } from "@/utils/blankReveal.js";
import { splitAnswerBlanks } from "@/utils/answerBlank.js";
import { blankHostField, blankHostText } from "@/lib/problem/blankHost";
import { hasNoAnswer } from "@/utils/answerState.js";
import { problemTypeLabel } from "@/utils/problemLabels.js";

const CHOICE_TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "OX"];

/**
 * 채점 결과에서 "내 답"과 "정답"을 한 줄씩 세운다.
 *
 * 예전에는 `정답: 대외경조금` 한 줄이 전부였다. 내가 뭐라고 썼는지가 없어서, 오타로 틀린
 * 것인지 아예 모르고 틀린 것인지 구분되지 않았다. 라벨을 같은 너비로 고정해 두 줄의 값이
 * 세로로 맞아떨어지게 한다 — 다른 글자를 눈으로 찾는 일이라 자리가 어긋나면 읽기 어렵다.
 */
function AnswerLine({ label, value, valueClass = "text-ink-strong", chip = null }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-10 shrink-0 text-body-small font-medium text-ink-muted">{label}</span>
      <span className={`flex-1 whitespace-pre-wrap text-body ${valueClass}`}>{value}</span>
      {chip}
    </div>
  );
}

/**
 * 문제 하나를 렌더하고 답 입력·제출·채점 결과 표시를 담당하는 표현 컴포넌트.
 * 단건 풀이 화면(/solve/:id)과 랜덤 세트 진행 화면이 함께 쓴다.
 */
export default function ProblemSolveCard({ problem, onSubmitted, nextAction = null }) {
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
  // 채점 뒤 빈칸 자리에 되돌려 놓을 결과. 위치가 아니라 키로 찾는다(blankReveal.js 참고).
  const blankResultByKey = revealMapFrom(result?.blankResults);
  // 바에 정답을 적는 것은 주관식뿐이다(위 하단 바 주석 참고).
  const barAnswer =
    answered && !result.correct && problem.type === "SHORT_ANSWER" && result.correctAnswerSummary;

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
      // 채점이 끝나면 입력칸을 정답으로 바꿔 문장을 완성해 보여준다. 정답을 문장에서
      // 떼어 목록으로 세우면 "이게 어느 칸 답이었지"를 되짚어야 해서, 읽기는 쉬워도
      // 남지 않는다. 틀린 칸은 그 아래에 내가 쓴 답을 작게 달아 무엇이 달랐는지 보인다.
      const graded = blankResultByKey[segment.blankKey];
      if (graded) {
        const missing = !(graded.submittedAnswer ?? "").trim();
        return (
          <span
            key={index}
            className={`mx-1 inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-sm border-b-2 px-2 py-0.5 align-baseline ${
              graded.correct ? "border-success-text bg-success-bg" : "border-danger-text bg-danger-bg"
            }`}
          >
            {/*
              내 답을 정답 앞에 같은 줄로 둔다. 세로로 쌓으면 문장 한가운데가 위아래로
              벌어져 줄 밑선이 흐트러진다. 읽는 차례도 "내가 쓴 것 → 맞는 것" 이 자연스럽다.
              (미입력) 은 취소선을 긋지 않는다 — 지울 글자가 없다.
            */}
            {!graded.correct && (
              <span className={`text-body-small text-ink-muted ${missing ? "" : "line-through"}`}>
                {missing ? "(미입력)" : graded.submittedAnswer}
              </span>
            )}
            {/*
              정답은 맞은 칸에서만 초록이다. 틀린 칸에서 정답까지 붉게 칠하면 붉은색이
              "틀림"과 "정답" 두 가지를 동시에 뜻하게 된다 — 칸 색이 이미 틀림을 말한다.
            */}
            <span className={`font-bold ${graded.correct ? "text-success-text" : "text-ink-strong"}`}>
              {graded.correctAnswer}
            </span>
          </span>
        );
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
        {/*
          질문은 보기·지문보다 한 단 크고 굵다. 예전에는 셋 다 14px 보통 굵기라 무엇이
          물음인지 눈에 먼저 들어오지 않았다. 지문(아래 박스)은 14px 그대로 둔다 —
          읽을 거리이지 물음이 아니다.
        */}
        {blanksLiveInContent ? (
          <p className="text-section-title font-semibold leading-loose text-ink-strong">{renderWithBlanks(problem.content)}</p>
        ) : (
          <p className="whitespace-pre-wrap text-section-title font-semibold leading-relaxed text-ink-strong">{renderAnswerBlanks(problem.content)}</p>
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

        {/* 채점이 끝나면 입력 진행도는 알려 줄 것이 없다 — 문장이 이미 정답을 보여준다. */}
        {problem.type === "FILL_BLANK" && !answered && (
          <p className="mt-3 text-body-small text-ink-muted">
            빈칸 {problem.blanksToAnswer.length}개 중{" "}
            {problem.blanksToAnswer.filter((key) => (blankInputs[key] ?? "").trim()).length}개 입력
          </p>
        )}

        {CHOICE_TYPES.includes(problem.type) && (
          <ul className={CHOICE_LIST_CLASS}>
            {problem.choices.map((choice) => {
              const selected = selectedChoiceIds.includes(choice.id);
              // 채점 전에는 어느 줄이 정답인지 드러나지 않는다 — correctChoiceIds 는 제출 응답에만 있다.
              const isAnswer = answered && (result.correctChoiceIds ?? []).includes(choice.id);
              const isMyWrongPick = answered && selected && !isAnswer;
              // 채점 뒤에는 고른 줄을 파랑으로 두지 않는다. 파랑은 "고름"이지 "맞음"이 아닌데,
              // 옆에 초록 정답이 서면 둘 중 어느 쪽이 내 답인지 읽히지 않는다.
              const tone = !answered
                ? selected
                  ? "border-brand-blue bg-selection-bg text-ink-strong"
                  : "border-line-default bg-surface-default text-ink-default hover:bg-surface-subtle"
                : isAnswer
                  ? "border-success-text bg-success-bg text-ink-strong"
                  : isMyWrongPick
                    ? "border-danger-text bg-danger-bg text-ink-strong"
                    : "border-line-default bg-surface-default text-ink-default opacity-70";
              return (
                <li key={choice.id}>
                  <label
                    className={`solve-choice flex items-center gap-3 rounded-md border px-4 py-3 text-body focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-brand-aqua ${CHOICE_ITEM_MIN_HEIGHT} ${tone} ${
                      answered ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type={problem.type === "MCQ_MULTI" ? "checkbox" : "radio"}
                      name="choice"
                      className="h-4 w-4 accent-brand-blue"
                      checked={selected}
                      disabled={answered}
                      onChange={() => toggleChoice(choice.id)}
                    />
                    <span className="flex-1">{choice.text}</span>
                    {isAnswer && (
                      <span className="shrink-0 rounded-full bg-success-text px-2 py-0.5 text-label font-bold text-surface-default">
                        정답
                      </span>
                    )}
                    {isMyWrongPick && (
                      <span className="shrink-0 rounded-full bg-danger-text px-2 py-0.5 text-label font-bold text-surface-default">
                        내 답
                      </span>
                    )}
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
          해설과 빈칸별 내역은 답을 적은 자리 바로 아래에 둔다. 아래 고정 바는 판정과
          다음 행동만 맡는다 — 길이가 정해지지 않은 글을 바에 넣으면 화면을 삼킨다.
        */}
        {/*
          해설만 남긴다. 빈칸별 정답은 위 문장 안으로 되돌아갔다 — 같은 사실을 두 자리에
          두면 어느 쪽을 봐야 할지 모르게 된다.
        */}
        {answered && result.explanation && (
          <div className="mt-5 border-t border-line-default pt-4">
            <p className="whitespace-pre-wrap text-body text-ink-default">{result.explanation}</p>
          </div>
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

      {/*
        판정과 다음 행동을 화면 아래 한 곳에 붙박는다.
        예전에는 문제 카드 · 결과 카드 · 다음 버튼이 세로로 셋이었고, 문제가 길면 판정도
        버튼도 스크롤해야 나왔다. sticky bottom-0 은 넘칠 때만 붙고 짧은 화면에서는
        제자리에 서므로, 짧은 문제에서 화면을 가리지 않는다.

        해설과 빈칸별 내역은 바에 넣지 않는다 — 길이가 정해져 있지 않아 바가 화면을 삼킨다.
        그것들은 문제 카드 안, 답을 적은 자리 바로 아래에 남는다.
      */}
      {answered && (
        <div
          className={`solve-feedback sticky bottom-0 z-10 mt-4 flex items-center gap-3 rounded-lg border border-line-default px-4 py-3 shadow-surface ${
            result.correct ? "bg-success-bg" : "bg-danger-bg"
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className={`flex items-center gap-2 text-body font-bold ${result.correct ? "text-success-text" : "text-danger-text"}`}>
              {/*
                튐은 맞혔을 때만이다. 틀렸을 때 흔드는 관용구를 쓰지 않는 것과 같은 이유로 —
                한 바퀴에 수십 번 나오는 자리에서 강조는 나무람으로 읽힌다. 색과 아이콘이면 충분하다.
              */}
              {result.correct ? (
                <CheckCircle size={18} weight="fill" aria-hidden="true" className="solve-tick shrink-0" />
              ) : (
                <XCircle size={18} weight="fill" aria-hidden="true" className="shrink-0" />
              )}
              {result.correct ? "정답입니다" : "틀렸습니다"}
            </p>
            {/*
              주관식만 정답을 바에 적는다. 객관식은 보기 줄에 이미 표가 붙어 있고,
              빈칸 채우기는 여러 개라 바가 높아진다 — 둘 다 카드 안에서 담당한다.
            */}
            {barAnswer && (
              <>
                <AnswerLine label="정답" value={result.correctAnswerSummary} valueClass="font-bold text-success-text" />
                <AnswerLine label="내 답" value={submittedText.trim() || "(미입력)"} />
              </>
            )}
          </div>
          {nextAction && <div className="shrink-0">{nextAction}</div>}
        </div>
      )}
    </>
  );
}
