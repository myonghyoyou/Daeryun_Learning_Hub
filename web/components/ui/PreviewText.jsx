import { previewSegments } from "@/utils/problemPreview.js";

/**
 * 문제 본문을 읽기 전용으로 보여주는 자리(목록·이력·결과 요약·관리자 표)에서 쓴다.
 *
 * 빈 괄호 `( )` 를 답 적는 자리처럼 그린다 — 풀이 화면(ProblemSolveCard.renderAnswerBlanks)과
 * 같은 장치이고, 나누는 규칙도 splitAnswerBlanks 하나를 함께 쓴다. 두 곳에 따로 적으면
 * 한쪽만 고쳐졌을 때 같은 문제가 화면마다 다르게 보인다.
 *
 * 다른 점은 안쪽 칸의 너비뿐이다. 목록은 한두 줄로 잘리는 자리라 풀이 화면의 54px 대신
 * 32px 로 좁힌다 — 괄호가 6개인 문제도 있어서, 넓게 두면 정작 읽어야 할 글이 밀려난다.
 *
 * 글자만 필요한 자리(title 툴팁 등)에는 이 컴포넌트가 아니라 previewContent 를 쓴다.
 */
export default function PreviewText({ text }) {
  return previewSegments(text).map((segment, index) =>
    segment.type === "text" ? (
      <span key={index}>{segment.value}</span>
    ) : (
      <span key={index} className="mx-px whitespace-nowrap">
        <span className="font-bold text-brand-blue">(</span>
        {/* 점선만 남기면 화면 낭독기가 아무것도 읽지 않으므로 "빈칸"을 숨은 글자로 넣는다. */}
        <span
          aria-hidden="true"
          className="mx-0.5 inline-block h-[1.15em] w-8 border-b border-dashed border-line-strong align-[-0.22em]"
        />
        <span className="sr-only">빈칸</span>
        <span className="font-bold text-brand-blue">)</span>
      </span>
    )
  );
}
