/**
 * MCQ_SINGLE/MCQ_MULTI/OX 보기 목록의 순수 로직. 백엔드 ProblemServiceImpl의
 * validateChoices/OX 전용 크기 검사를 클라이언트에서 미리 걸러 서버 오류를 피한다
 * (Task 8 브리핑 "서버 사이드 규칙" 섹션). 서버 메시지와 문구를 맞춰 두 곳의 규칙이
 * 갈라지지 않게 한다.
 */
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 5;

export function createChoice() {
  return { text: "", correct: false };
}

// MCQ_SINGLE/OX는 라디오 버튼처럼 단일 선택(다른 보기의 correct는 모두 해제),
// MCQ_MULTI는 체크박스처럼 대상 인덱스만 토글한다.
export function setChoiceCorrect(choices, index, type) {
  if (type === "MCQ_MULTI") {
    return choices.map((choice, i) => (i === index ? { ...choice, correct: !choice.correct } : choice));
  }
  return choices.map((choice, i) => ({ ...choice, correct: i === index }));
}

function isBlankText(text) {
  return !text || !text.trim();
}

// 서버(ProblemServiceImpl.validate/validateChoices)와 동일한 순서로 검사한다:
// 1) OX는 정확히 2개, 그 외 유형은 2~5개  2) 빈 보기 금지(내부 공백 포함, 필터링하지 않음)
// 3) 정답 개수(SINGLE/OX는 정확히 1개, MULTI는 1개 이상)
export function validateChoices(type, choices) {
  if (type === "OX") {
    if (!choices || choices.length !== 2) {
      return "OX 문제는 보기 2개(O/X)가 필요합니다.";
    }
  } else if (!choices || choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
    return "보기는 2개 이상 5개 이하이어야 합니다.";
  }

  if (choices.some((choice) => isBlankText(choice.text))) {
    return "빈 보기는 입력할 수 없습니다.";
  }

  const correctCount = choices.filter((choice) => choice.correct).length;
  if (type === "MCQ_MULTI") {
    if (correctCount < 1) {
      return "정답을 최소 1개 선택하세요.";
    }
  } else if (correctCount !== 1) {
    return "정답을 1개 선택하세요.";
  }

  return null;
}
