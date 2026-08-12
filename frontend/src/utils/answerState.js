/**
 * 제출 버튼을 잠글지 판정하는 순수 함수(디자인 시스템 8.4.3 "답안 미선택 → disabled").
 *
 * 유형마다 "비었다"의 의미가 다르다: 객관식은 선택 0개, 주관식은 공백만 입력, 빈칸은
 * 노출된 칸이 모두 비었을 때다. 빈칸은 하나라도 채웠으면 제출할 수 있어야 한다 —
 * 나머지는 오답으로 채점되면 되고, 다 채워야 제출할 수 있게 하면 포기할 자유가 없다.
 *
 * 모르는 유형은 막지 않는다. 새 유형이 생겼을 때 제출을 잠가 버리면 그 유형을 아예 풀 수
 * 없게 되는데, 그것이 잘못 제출되는 것보다 나쁘다.
 */
const CHOICE_TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "OX"];

export function hasNoAnswer({ type, selectedChoiceIds, submittedText, blankInputs, blanksToAnswer }) {
  if (CHOICE_TYPES.includes(type)) {
    return (selectedChoiceIds ?? []).length === 0;
  }
  if (type === "SHORT_ANSWER") {
    return !(submittedText ?? "").trim();
  }
  if (type === "FILL_BLANK") {
    const keys = blanksToAnswer ?? [];
    if (keys.length === 0) return true;
    return keys.every((key) => !((blankInputs ?? {})[key] ?? "").trim());
  }
  return false;
}
