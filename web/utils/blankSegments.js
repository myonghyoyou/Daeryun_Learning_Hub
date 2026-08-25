/**
 * content 문자열을 지정 모드가 렌더할 세그먼트 배열로 파싱한다.
 *
 * {{key}} 마커는 blank 세그먼트(정답 포함)로, 그 사이 텍스트는 공백(space)·구두점(punct)·
 * 어절(word) 세 갈래로 나눈다. word 의 start/end 는 원본 content 인덱스라, 클릭 시 그 구간을
 * {{bN}} 으로 치환할 수 있다(designateBlank, Task 3).
 *
 * 쉼표 등 구두점은 어절에서 떼어 punct 세그먼트로 둔다("편성,"→word "편성" + punct ",";
 * 결정 5, 쉼표 제외 공백 어절). 조사는 여기서 떼지 않고 클릭 시점의 splitTrailing(Task 1)이 뗀다.
 */
// 서버는 키 형식을 강제하지 않는다. 지정 모드가 만드는 b1·b2… 뿐 아니라 이 앱의 입력란
// placeholder이자 기존 데이터의 형식인 blank_1 같은 키도 마커로 인식해야 한다. 인식하지
// 못하면 마커가 평범한 어절로 렌더돼 클릭 시 마커 문자열이 정답이 되고 본문이 깨진다.
const MARKER = /\{\{([A-Za-z0-9_-]+)\}\}/g;

function segmentText(text, offset, out) {
  // 공백 / 구두점(,.·:;) / 어절 세 갈래로 나눈다. 구두점을 별도 세그먼트로 떼어 어절을
  // 클릭 단위에서 제외한다(결정 5: 쉼표 제외 공백 어절). 어절은 공백·구두점이 아닌 연속.
  const re = /(\s+)|([,.·:;]+)|([^\s,.·:;]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) {
      out.push({ type: "space", text: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ type: "punct", text: m[2] });
    } else {
      const start = offset + m.index;
      out.push({ type: "word", text: m[3], start, end: start + m[3].length });
    }
  }
}

export function segmentContent(content, blanks) {
  const answerByKey = new Map(blanks.map((b) => [b.blankKey, b.answerText]));
  const out = [];
  let last = 0;
  let m;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(content)) !== null) {
    if (m.index > last) {
      segmentText(content.slice(last, m.index), last, out);
    }
    out.push({
      type: "blank",
      key: m[1],
      answer: answerByKey.get(m[1]) ?? "",
      start: m.index,
      end: m.index + m[0].length,
    });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    segmentText(content.slice(last), last, out);
  }
  return out;
}
