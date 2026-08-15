export interface Envelope<T> {
  resultCode: number;
  resultMsg: string;
  data?: T;
}

// 현재 ResponseDto.ok 미러: 성공 코드 200 + 고정 문구. data 가 undefined 면 키를 넣지 않는다(NON_NULL).
export function ok<T>(data?: T): Envelope<T> {
  const body: Envelope<T> = { resultCode: 200, resultMsg: "정상 처리되었습니다." };
  if (data !== undefined) body.data = data;
  return body;
}

export function okMessage(code: number, message: string): Envelope<never> {
  return { resultCode: code, resultMsg: message };
}
