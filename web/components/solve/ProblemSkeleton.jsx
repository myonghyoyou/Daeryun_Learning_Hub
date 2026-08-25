import Surface from "@/components/ui/Surface.jsx";
import { CHOICE_LIST_CLASS, CHOICE_ITEM_MIN_HEIGHT, SUBMIT_AREA_CLASS } from "@/components/solve/choiceLayout.js";

/**
 * 문제 로딩 중 자리를 지키는 skeleton(디자인 시스템 8.4.3). 실제 카드와 같은 위계로
 * 배치해 로드 완료 시 레이아웃이 튀지 않게 한다. 보기·제출 영역의 높이·간격은
 * ProblemSolveCard 와 같은 상수를 import 해서 쓴다 — 수치를 여기 다시 적으면 한쪽만
 * 바뀌었을 때 정확히 이 컴포넌트가 막으려던 현상이 생긴다.
 */
export default function ProblemSkeleton() {
  return (
    <>
      <div className="sr-only" role="status">
        문제를 불러오는 중입니다
      </div>
      <Surface className="p-5 md:p-6" aria-hidden="true">
        <div className="mb-3 inline-block h-6 w-24 animate-pulse rounded-full bg-surface-subtle" />
        <div className="space-y-2">
          <div className="h-5 w-full animate-pulse rounded-xs bg-surface-subtle" />
          <div className="h-5 w-3/4 animate-pulse rounded-xs bg-surface-subtle" />
        </div>
        <ul className={CHOICE_LIST_CLASS}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={`${CHOICE_ITEM_MIN_HEIGHT} w-full animate-pulse rounded-md bg-surface-subtle`} />
          ))}
        </ul>
        <div className={SUBMIT_AREA_CLASS}>
          <div className="h-11 w-full animate-pulse rounded-sm bg-surface-subtle sm:w-24" />
          {/* 실제 안내 문구("답안을 입력하면...")는 text-body-small 한 줄이라 높이가
              정확히 18px 다. h-5(20px)로 두면 로드 완료 순간 2px 이 튄다. */}
          <div className="mt-2 h-4.5 w-3/4 animate-pulse rounded-xs bg-surface-subtle" />
        </div>
      </Surface>
    </>
  );
}
