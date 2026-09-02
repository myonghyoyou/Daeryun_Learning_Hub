/**
 * 문제 본문을 질문과 지문으로 나눈다.
 *
 * 종이 문제집을 옮겨 온 데이터라 "다음 괄호 안에 적합한 용어는? ( )의 단가는 …" 처럼
 * 질문과 지문이 한 줄로 이어 붙어 있다. 실측 결과 문제당 물음표가 최대 하나뿐이라
 * (724문제 중 2개 이상인 것 0건) 첫 물음표가 곧 경계다.
 *
 * 나누지 않는 경우가 두 가지다:
 *  - 물음표가 없다 → 지시문형 문제("…고르시오.")
 *  - 물음표 뒤가 너무 짧다 → "빈칸에 들어갈 말은? ( )" 처럼 답 자리만 남은 경우.
 *    이걸 지문으로 떼면 빈 박스만 생긴다.
 */
const MIN_REFERENCE_LENGTH = 10;

export function splitQuestionAndReference(content: string): { question: string; reference: string | null } {
  const index = content.indexOf("?");
  if (index < 0) return { question: content, reference: null };

  const question = content.slice(0, index + 1).trim();
  const reference = content.slice(index + 1).trim();
  if (reference.length < MIN_REFERENCE_LENGTH) return { question: content, reference: null };

  return { question, reference };
}
