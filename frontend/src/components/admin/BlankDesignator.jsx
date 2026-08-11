import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { segmentContent } from "@/utils/blankSegments.js";

// 아이콘 전용 버튼(경계조정·해제) 공통 포커스 스타일. Modal.jsx의 닫기 버튼·Button.jsx의
// BASE_CLASS와 같은 focus-visible 규칙을 써서 이 화면에서만 포커스 링이 사라지지 않게 한다.
const ICON_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-xs text-ink-muted hover:text-ink-strong " +
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua " +
  "disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 빈칸 지정 모드. content 문자열을 세그먼트로 렌더한다 — 일반 어절은 클릭하면 빈칸이 되고,
 * 빈칸은 Input 모양 칩으로 보이며 해제·경계조정 버튼을 갖는다. 자기 상태는 없다: 클릭 결과를
 * onDesignate/onRelease/onAdjust 콜백으로 상위(ProblemFormPage)에 올린다.
 *
 * 세그먼트는 매 렌더마다 content/blanks로부터 다시 계산한다(useMemo로 캐시하지 않는다).
 * designateBlank는 넘어온 word 세그먼트의 [start, end)가 현재 content와 어긋나면 아무 것도
 * 하지 않는 방어 가드를 갖고 있어서, 캐시된 낡은 오프셋을 클릭 핸들러에 쥐여주면 이후 클릭이
 * 조용히 무시된다.
 */
export default function BlankDesignator({ content, blanks, onDesignate, onRelease, onAdjust }) {
  const segments = segmentContent(content, blanks);
  // 같은 키의 마커가 여러 번 나오면 ±1 경계 조정이 성립하지 않는다(정답은 하나인데 각
  // 마커 뒤 글자가 다르다). 버튼을 막고 이유를 title로 알린다 — 눌러도 아무 일이 없으면
  // 고장으로 보인다.
  const keyCounts = segments.reduce((acc, s) => {
    if (s.type === "blank") acc[s.key] = (acc[s.key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      role="group"
      className="min-h-[76px] rounded-sm border border-line-default bg-surface-subtle p-3 leading-9"
      aria-label="빈칸 지정 영역"
    >
      {segments.map((seg, i) => {
        if (seg.type === "space" || seg.type === "punct") {
          // 공백·구두점은 클릭 대상도 상태도 없는 inert 텍스트라 배열 인덱스 키로 충분하다
          // (word/blank처럼 뒤 세그먼트가 밀릴 때 포커스를 잘못 물려받을 대상이 아니다).
          // word/blank와 접두사로 구분해 배열 전체에서 키가 겹치지 않게 한다.
          return <span key={`gap-${i}`}>{seg.text}</span>;
        }
        if (seg.type === "word") {
          // word는 배열 인덱스가 아니라 content 안의 안정적인 시작 오프셋으로 키를 잡는다.
          // 앞쪽에서 빈칸을 지정하면 뒤쪽 word들의 배열 인덱스가 모두 밀리는데, 인덱스
          // 키였다면 React가 이전 위치의 <button> DOM을 엉뚱한 word에 재사용해 그 버튼이
          // 갖고 있던 포커스가 클릭하지 않은 단어로 조용히 옮겨간다.
          return (
            <button
              key={`word-${seg.start}`}
              type="button"
              onClick={() => onDesignate(seg)}
              className="cursor-pointer rounded-xs px-0.5 hover:bg-surface-blue focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
              title="클릭해 빈칸으로 지정"
            >
              {seg.text}
            </button>
          );
        }
        // blank: Input 모양 칩 + 조정/해제. 칩 자체는 <span>이라 안의 <button> 3개가 서로
        // 형제로만 존재한다 — <button> 안에 <button>을 중첩하지 않는다. key는 word와 같은
        // 이유로 seg.start(원본 content 안의 마커 시작 오프셋)라는 안정적 식별자를 쓴다 —
        // 같은 blankKey(seg.key)의 마커가 본문에 두 번 이상 나올 수 있어 seg.key만으로는
        // 형제 노드의 key가 중복될 수 있다.
        const multipleOccurrences = keyCounts[seg.key] > 1;
        const adjustDisabledTitle = multipleOccurrences
          ? `${seg.key} 마커가 본문에 여러 번 있어 정답 범위를 조정할 수 없습니다`
          : undefined;
        return (
          <span
            key={`blank-${seg.start}`}
            className="mx-0.5 inline-flex h-[30px] items-center gap-1 rounded-sm border border-brand-aqua bg-surface-default px-2 align-middle"
          >
            <button
              type="button"
              onClick={() => onAdjust(seg.key, -1)}
              aria-label={`${seg.key} 정답 한 글자 줄이기`}
              className={ICON_BUTTON_CLASS}
              disabled={multipleOccurrences}
              title={adjustDisabledTitle}
            >
              <CaretLeft size={12} aria-hidden="true" />
            </button>
            <span className="text-body-small text-ink-strong">{seg.answer || "빈칸"}</span>
            <button
              type="button"
              onClick={() => onAdjust(seg.key, 1)}
              aria-label={`${seg.key} 정답 한 글자 늘리기`}
              className={ICON_BUTTON_CLASS}
              disabled={multipleOccurrences}
              title={adjustDisabledTitle}
            >
              <CaretRight size={12} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onRelease(seg.key)}
              aria-label={`${seg.key} 빈칸 해제`}
              className={ICON_BUTTON_CLASS}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
