/**
 * 계정 엑셀 업로드 응답의 errorDetail은 "행 N: 사유" 줄바꿈 문자열이다
 * (UserExcelUploadService 참고). 부분 성공(8.6.3)을 요약과 행별 오류로 분리해
 * 보여주려면 이 문자열을 파싱해 목록으로 바꿔야 하므로, 그 변환을 순수 함수로
 * 뽑아 테스트한다.
 */
export function parseExcelErrorDetail(errorDetail) {
  if (!errorDetail) {
    return [];
  }
  return errorDetail
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^행\s*(\d+)\s*:\s*(.*)$/);
      if (match) {
        return { row: Number(match[1]), reason: match[2] };
      }
      // 예상 형식과 다른 줄도 유실하지 않고 그대로 사유로 보여준다.
      return { row: null, reason: line };
    });
}
