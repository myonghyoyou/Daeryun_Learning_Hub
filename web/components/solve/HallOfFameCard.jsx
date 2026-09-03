import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Trophy } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import { fetchHallOfFame } from "@/apiClient/hallOfFame.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

const PERIODS = [
  { key: "month", label: "이번 달" },
  { key: "allTime", label: "전체 기간" },
];
const TARGETS = [
  { key: "people", label: "개인" },
  { key: "teams", label: "팀" },
];

/**
 * 세그먼트 컨트롤. 회색 트랙 위로 흰 알약이 고른 쪽에 미끄러져 간다.
 *
 * 알약의 자리와 너비를 JS 로 재는 이유가 있다. 글자 길이가 서로 달라("이번 달" 60px,
 * "전체 기간" 72px — 2026-09-03 실측) CSS 만으로 맞추려면 두 칸을 같은 너비로 묶어야
 * 하는데, 그러면 "개인·팀"처럼 짧은 짝에서 빈 공간이 크게 남는다.
 */
function Segmented({ label, options, value, onChange }) {
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const [ready, setReady] = useState(false);

  // 그리기 전에 자리를 잡아야 첫 화면에서 알약이 왼쪽에서 날아오지 않는다.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return undefined;

    function move() {
      const active = track.querySelector('[aria-selected="true"]');
      if (!active) return;
      thumb.style.width = `${active.offsetWidth}px`;
      thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
    }
    move();
    // 글꼴이 늦게 오면 버튼 너비가 바뀐다. 창 크기가 바뀔 때도 다시 잰다.
    window.addEventListener("resize", move);
    document.fonts?.ready?.then(move);
    return () => window.removeEventListener("resize", move);
  }, [value]);

  // 첫 배치는 옮기는 티가 나지 않게 하고, 그다음 프레임부터 미끄러지게 한다.
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={trackRef} role="tablist" aria-label={label} className="relative inline-flex gap-1 rounded-[9px] bg-[#EDF1F7] p-[3px]">
      <span
        ref={thumbRef}
        aria-hidden="true"
        className={`hof-thumb pointer-events-none absolute left-[3px] top-[3px] h-[calc(100%-6px)] rounded-[7px] bg-surface-default shadow-[0_1px_3px_rgba(16,43,76,0.10)] ${
          ready ? "transition-[transform,width] duration-200 ease-out" : ""
        }`}
      />
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          onClick={() => onChange(option.key)}
          className={`relative z-10 rounded-[7px] px-3 py-1.5 text-body-small transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua ${
            value === option.key ? "font-bold text-info-text" : "font-medium text-ink-muted hover:text-ink-strong"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const MEDAL_TONE = {
  1: { disc: "border-[#DEC489] bg-[#F7EBCB] text-[#8A6416]", ribbon: "bg-[#D9B96F]", delay: "0ms" },
  2: { disc: "border-[#C9D4DE] bg-[#EAEFF4] text-[#5A6875]", ribbon: "bg-[#B9C6D2]", delay: "80ms" },
  3: { disc: "border-[#D9B594] bg-[#F3E1D3] text-[#8A5731]", ribbon: "bg-[#CFA381]", delay: "160ms" },
};

/**
 * 금·은·동 원반과 리본. 원반 22px, 상자 27px.
 *
 * **상자 높이가 리본까지 품는다**(원반 22px + 드러나는 리본 5px). 리본을 상자 밖에 두면
 * 가운데 정렬이 원반만 기준으로 맞아, 눈에 보이는 덩어리가 글자보다 위로 뜬다 —
 * 정렬은 맞는데 어긋나 보이는 상태가 된다(2026-09-03 실측).
 *
 * 리본을 원반 **앞에** 두는 것도 규칙이다. 둘 다 자리를 잡은 요소라 나중에 오는 원반이
 * 리본 위에 그려져, 겹치는 아래쪽이 가려진다. z-index 로 뒤에 깔면 안 된다 — Surface 가
 * 쌓임 맥락을 만들지 않아 음수 z-index 가 카드의 흰 배경 뒤까지 내려가 리본이 통째로
 * 사라진다(2026-09-03 실측).
 *
 * 숫자를 원반 안에 새기는 이유는 세 금속의 밝기가 비슷해 색만으로는 순서가 안 읽히기 때문이다.
 */
function Medal({ rank }) {
  const tone = MEDAL_TONE[rank];
  const ribbon = `absolute top-0 h-[13px] w-[4px] rounded-[1px] ${tone.ribbon}`;
  return (
    <span
      className="hof-medal relative inline-block h-[27px] w-[22px] shrink-0 origin-[50%_40%] pt-[5px] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:-rotate-6"
      style={{ animation: `medal-pop 380ms cubic-bezier(0.34,1.56,0.64,1) ${tone.delay} backwards` }}
    >
      <span aria-hidden="true" className={`${ribbon} left-1 rotate-[20deg]`} />
      <span aria-hidden="true" className={`${ribbon} right-1 -rotate-[20deg]`} />
      <span
        aria-hidden="true"
        className={`relative grid h-[22px] w-[22px] place-items-center rounded-full border text-body-small font-bold tabular-nums ${tone.disc}`}
      >
        {rank}
      </span>
      <span className="sr-only">{rank}위</span>
    </span>
  );
}

/**
 * 동점자 목록을 여는 작은 펼침.
 *
 * components/ui 에 툴팁이 없어 여기서만 쓰는 것으로 둔다. 마우스를 올리거나 키보드
 * 포커스가 닿으면 열리고, 누르면 고정된다 — **휴대폰에는 마우스 올리기가 없어서**
 * 누르기를 함께 받아야 한다. Esc 로 닫는다.
 */
function OtherNames({ others, otherCount, unit, render }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const panelId = useId();
  const hiddenCount = otherCount - others.length;
  const open = hovered || pinned;

  useEffect(() => {
    if (!pinned) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setPinned(false);
        setHovered(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pinned]);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => setPinned((v) => !v)}
        className="ml-1 rounded-sm text-body-small font-medium text-action-secondary-text underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
      >
        외 {otherCount}{unit}
      </button>
      {open && (
        <span
          id={panelId}
          role="tooltip"
          className="absolute left-0 top-full z-10 mt-1 flex w-max max-w-[240px] flex-col gap-1 rounded-md border border-line-default bg-surface-default p-3 shadow-raised"
        >
          {others.map((item, index) => (
            <span key={index} className="text-body-small text-ink-default">{render(item)}</span>
          ))}
          {hiddenCount > 0 && (
            <span className="text-body-small text-ink-muted">외 {hiddenCount}{unit} 더</span>
          )}
        </span>
      )}
    </span>
  );
}

function RankList({ rows, unit, render }) {
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.rank} className="group -mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-subtle">
          <Medal rank={row.rank} />
          <span className="flex-1 text-body text-ink-strong">
            {render(row.leader)}
            {row.otherCount > 0 && (
              <OtherNames others={row.others} otherCount={row.otherCount} unit={unit} render={render} />
            )}
          </span>
          <span className="shrink-0 text-body-small font-medium tabular-nums text-ink-default">
            {row.correctCount}개
          </span>
        </li>
      ))}
    </ol>
  );
}

const VIEW = {
  people: {
    unit: "명",
    render: (p) => `${p.departmentName} ${p.name}`,
    rows: (board) => board.people.top,
    foot: (board) =>
      board.people.me
        ? `내 순위 ${board.people.me.rank}위 · ${board.people.me.correctCount}개`
        : "아직 맞힌 문제가 없습니다.",
  },
  teams: {
    unit: "팀",
    render: (t) => t.departmentName,
    rows: (board) => board.teams.top,
    foot: (board) =>
      board.teams.mine
        ? `우리 팀 ${board.teams.mine.rank}위 · ${board.teams.mine.correctCount}개`
        : "우리 팀은 아직 맞힌 문제가 없습니다.",
  },
};

/**
 * 학습 홈의 명예의 전당. 맞힌 개수로 줄을 세운다.
 *
 * 순위 숫자는 "몇 번째 점수대"라는 뜻이다 — 1위가 여러 명이어도 다음 줄은 2위다. 그래서
 * 아래 한 줄에 맞힌 개수를 함께 적는다. "3위"만 있으면 위에 두 사람만 있다고 오해한다.
 */
export default function HallOfFameCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("month");
  const [target, setTarget] = useState("people");

  useEffect(() => {
    let cancelled = false;
    fetchHallOfFame()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(resolveErrorMessage(err, "명예의 전당을 불러오지 못했습니다."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const board = data ? data[period] : null;
  const view = VIEW[target];

  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-blue text-brand-blue">
          <Trophy size={22} aria-hidden="true" />
        </span>
        <p className="text-section-title font-semibold text-ink-strong">명예의 전당</p>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <Segmented label="집계 기간" options={PERIODS} value={period} onChange={setPeriod} />
        <Segmented label="순위 대상" options={TARGETS} value={target} onChange={setTarget} />
      </div>

      <div className="mt-4">
        {error ? (
          <p className="px-1 py-6 text-center text-body-small text-ink-muted">{error}</p>
        ) : !board ? (
          <p className="px-1 py-6 text-center text-body-small text-ink-muted">불러오는 중...</p>
        ) : view.rows(board).length === 0 ? (
          <p className="px-1 py-6 text-center text-body-small text-ink-muted">
            아직 아무도 문제를 맞히지 않았습니다.
          </p>
        ) : (
          // key 를 조합으로 두면 버튼을 누를 때마다 다시 마운트돼 등장 움직임이 다시 돈다.
          <div key={`${period}-${target}`} className="hof-board" style={{ animation: "board-in 180ms ease-out" }}>
            <RankList rows={view.rows(board)} unit={view.unit} render={view.render} />
            <p className="mt-3 border-t border-line-default pt-3 text-body-small text-ink-muted">
              {view.foot(board)}
            </p>
          </div>
        )}
      </div>
    </Surface>
  );
}
