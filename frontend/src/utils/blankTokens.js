/**
 * 빈칸 지정의 문자열 처리 순수 함수.
 *
 * 한국어 어절은 조사가 붙는다("배관을"). 클릭해 빈칸으로 만들 때 정답은 명사("배관"),
 * 본문에 남길 꼬리는 조사("을")로 나눠야 {{b1}}을 통하여 처럼 자연스러워진다. 쉼표 같은
 * 구두점도 꼬리로 뗀다.
 *
 * 자동 분리는 완벽하지 않다("야간"→"야"+"간" 오분리 가능). 그래서 화면은 클릭 후 경계를
 * ±1글자 조정하는 보조 수단을 함께 둔다(BlankDesignator). 이 함수는 기본 추정만 한다.
 */

// 긴 것부터. 앞에서부터 첫 매칭을 쓰므로 "에서"가 "에"보다 앞에 있어야 한다.
export const TRAILING_PARTICLES = [
  "으로서", "으로써", "에서는", "에게서", "으로", "에서", "에게", "께서", "이란", "라는",
  "은", "는", "이", "가", "을", "를", "에", "의", "와", "과", "도", "만", "란", "로", "나",
];

const TRAILING_PUNCT = /[,.·:;]+$/;

export function splitTrailing(word) {
  let core = word;
  let trailing = "";

  // 1) 끝의 구두점을 먼저 뗀다.
  const punct = core.match(TRAILING_PUNCT);
  if (punct) {
    trailing = punct[0] + trailing;
    core = core.slice(0, -punct[0].length);
  }

  // 2) 조사를 뗀다. 뗀 뒤 core 가 비면 되돌린다(조사만 있는 어절 방지).
  for (const p of TRAILING_PARTICLES) {
    if (core.length > p.length && core.endsWith(p)) {
      core = core.slice(0, -p.length);
      trailing = p + trailing;
      break;
    }
  }

  return { core, trailing };
}

export function nextBlankKey(existingKeys) {
  const used = new Set(existingKeys);
  let n = 1;
  while (used.has(`b${n}`)) {
    n += 1;
  }
  return `b${n}`;
}
