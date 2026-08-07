/**
 * 문제 등록/수정 폼 전체의 클라이언트 측 검증. 유형 공통 규칙(문제 내용, 태그)과
 * 유형별 규칙(보기/정답/빈칸)을 하나의 오류 맵으로 모아 ProblemFormPage가 Input/Select의
 * error prop에 그대로 꽂아 쓸 수 있게 한다. 각 유형별 규칙은 problemChoices.js/
 * problemAnswers.js/problemBlanks.js가 이미 서버(ProblemServiceImpl) 문구와 순서를
 * 맞춰 두었으므로 여기서는 그것들을 유형에 따라 위임하기만 한다.
 */
import { validateChoices } from "./problemChoices.js";
import { validateAnswers } from "./problemAnswers.js";
import { validateBlanks } from "./problemBlanks.js";
import { parseTagsInput, normalizeTags, validateTags } from "./problemTags.js";

export function validateProblemForm(form) {
  const errors = {};

  if (!form.content || !form.content.trim()) {
    errors.content = "문제 내용을 입력하세요.";
  }

  const tags = normalizeTags(parseTagsInput(form.tagsInput));
  const tagsError = validateTags(tags);
  if (tagsError) {
    errors.tags = tagsError;
  }

  switch (form.type) {
    case "SHORT_ANSWER": {
      const answersError = validateAnswers(form.answers);
      if (answersError) errors.answers = answersError;
      break;
    }
    case "FILL_BLANK": {
      const blanksError = validateBlanks({
        content: form.content,
        blanks: form.blanks,
        blankRevealCount: form.blankRevealCount,
      });
      if (blanksError) errors.blanks = blanksError;
      break;
    }
    case "MCQ_SINGLE":
    case "MCQ_MULTI":
    case "OX":
    default: {
      const choicesError = validateChoices(form.type, form.choices);
      if (choicesError) errors.choices = choicesError;
      break;
    }
  }

  return errors;
}
