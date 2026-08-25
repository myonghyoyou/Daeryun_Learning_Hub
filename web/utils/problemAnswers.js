/**
 * SHORT_ANSWER 정답 목록의 순수 검증 로직. 서버(ProblemServiceImpl.validateAnswers)는
 * 정답이 하나도 없거나 빈 정답이 하나라도 있으면(목록 중간의 빈 항목 포함) 거부한다 —
 * 여기서도 빈 항목을 조용히 걸러내지 않고 그대로 오류로 보고해 사용자가 인지하게 한다.
 */
export function validateAnswers(answers) {
  if (!answers || answers.length === 0) {
    return "정답을 최소 1개 입력하세요.";
  }
  if (answers.some((answer) => !answer || !answer.trim())) {
    return "빈 정답은 입력할 수 없습니다.";
  }
  return null;
}
