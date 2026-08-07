/**
 * 문제 등록/수정 폼 상태를 createProblem/updateProblem의 요청 페이로드로 변환한다.
 * department_id/created_by는 서버가 세션(AuthUser)에서만 채우므로(ProblemServiceImpl.create)
 * 이 페이로드에는 절대 포함하지 않는다. 유형별로 choices/answers/blanks 중 해당 유형의
 * 필드만 보내고 나머지는 아예 키를 생략한다 — 백엔드 DTO(ProblemCreateRequest)는 모든
 * 필드를 갖고 있지만 saveTypeSpecificData가 request.getType()에 따라서만 읽으므로
 * 굳이 빈 배열을 보낼 필요가 없다.
 */
import { parseTagsInput, normalizeTags } from "./problemTags.js";

export function buildProblemPayload(form) {
  const tags = normalizeTags(parseTagsInput(form.tagsInput));
  const base = {
    type: form.type,
    content: form.content.trim(),
    imageUrl: form.imageUrl || null,
    referenceText: form.referenceText && form.referenceText.trim() ? form.referenceText.trim() : null,
    explanation: form.explanation && form.explanation.trim() ? form.explanation.trim() : null,
    tags,
  };

  if (form.type === "SHORT_ANSWER") {
    return { ...base, answers: form.answers.map((answer) => answer.trim()) };
  }

  if (form.type === "FILL_BLANK") {
    return {
      ...base,
      blanks: form.blanks.map((blank) => ({
        blankKey: blank.blankKey.trim(),
        answerText: blank.answerText.trim(),
      })),
      blankRevealCount: Number(form.blankRevealCount),
    };
  }

  return {
    ...base,
    choices: form.choices.map((choice) => ({ text: choice.text.trim(), correct: Boolean(choice.correct) })),
  };
}
