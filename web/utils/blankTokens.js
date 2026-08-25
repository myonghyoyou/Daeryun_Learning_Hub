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

// 단일 구두점 문자 판정. TRAILING_PUNCT(꼬리 전체 매칭)와 adjustBlankBoundary(경계 한 글자
// 판정)가 같은 문자 집합을 공유하도록 여기서 한 번만 정의한다.
const TRAILING_PUNCT_CHAR = /[,.·:;]/;
const TRAILING_PUNCT = new RegExp(`(?:${TRAILING_PUNCT_CHAR.source})+$`);

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

/**
 * word 세그먼트(Task 2)를 빈칸으로 만든다. 어절에서 조사·쉼표를 떼어 정답으로, 꼬리는
 * 본문에 남긴다. content 의 [start, end) 구간을 "{{key}}" + 꼬리로 치환한다.
 */
export function designateBlank(content, blanks, wordSeg) {
  if (content.slice(wordSeg.start, wordSeg.end) !== wordSeg.text) {
    return { content, blanks }; // 오프셋이 낡았다: 잘못 잘라 붙이는 대신 아무것도 하지 않는다
  }
  const { core, trailing } = splitTrailing(wordSeg.text);
  const key = nextBlankKey(blanks.map((b) => b.blankKey));
  const replacement = `{{${key}}}${trailing}`;
  const nextContent = content.slice(0, wordSeg.start) + replacement + content.slice(wordSeg.end);
  return {
    content: nextContent,
    blanks: [...blanks, { blankKey: key, answerText: core }],
  };
}

export function releaseBlank(content, blanks, key) {
  const blank = blanks.find((b) => b.blankKey === key);
  if (!blank) {
    return { content, blanks }; // 알 수 없는 키: 아무것도 하지 않는다
  }
  const marker = `{{${key}}}`;
  // 한 키의 정답은 하나다. 출현 중 하나만 되돌리면 나머지가 "아무 빈칸도 선언하지 않는"
  // 고아 마커가 되고, validateBlanks는 선언된 키만 검사하므로 그대로 저장된다.
  // 그래서 전부 되돌린다. replace 대신 슬라이스로 잇는 이유는 정답의 "$&" 등이
  // 특수 패턴으로 해석되지 않게 하기 위해서다.
  let out = "";
  let from = 0;
  for (;;) {
    const at = content.indexOf(marker, from);
    if (at < 0) break;
    out += content.slice(from, at) + blank.answerText;
    from = at + marker.length;
  }
  if (from === 0) {
    return { content, blanks }; // 본문에 마커가 없다
  }
  out += content.slice(from);
  return { content: out, blanks: blanks.filter((b) => b.blankKey !== key) };
}

/**
 * 빈칸 정답 경계를 delta(±1)만큼 옮긴다.
 *  +1: 마커 바로 뒤 본문 글자 1개를 정답 끝에 붙이고 본문에서 제거.
 *  -1: 정답 마지막 글자 1개를 마커 바로 뒤 본문으로 내보냄.
 * 조사 자동분리가 과했거나 모자랄 때 손으로 보정하는 용도.
 */
export function adjustBlankBoundary(content, blanks, key, delta) {
  const marker = `{{${key}}}`;
  const at = content.indexOf(marker);
  if (at < 0) {
    return { content, blanks };
  }
  if (content.indexOf(marker, at + marker.length) >= 0) {
    return { content, blanks }; // 같은 키가 여러 번 등장하면 경계 조정이 성립하지 않는다
  }
  const after = at + marker.length;
  const blank = blanks.find((b) => b.blankKey === key);
  if (!blank) {
    return { content, blanks };
  }

  if (delta > 0) {
    const ch = content[after];
    // 뒤가 공백/끝/구두점이면 흡수할 것이 없다. "{" "}"는 인접한 다른 {{bN}} 마커의 일부일
    // 수 있으므로 항상 거부한다 — 흡수하면 그 마커가 깨져 복구 불가능해진다.
    if (!ch || /\s/.test(ch) || ch === "{" || ch === "}" || TRAILING_PUNCT_CHAR.test(ch)) {
      return { content, blanks };
    }
    const nextContent = content.slice(0, after) + content.slice(after + 1);
    return {
      content: nextContent,
      blanks: blanks.map((b) => (b.blankKey === key ? { ...b, answerText: b.answerText + ch } : b)),
    };
  }

  if (delta < 0) {
    if (blank.answerText.length <= 1) {
      return { content, blanks }; // 정답이 비면 안 된다
    }
    const moved = blank.answerText.slice(-1);
    const nextContent = content.slice(0, after) + moved + content.slice(after);
    return {
      content: nextContent,
      blanks: blanks.map((b) =>
        b.blankKey === key ? { ...b, answerText: b.answerText.slice(0, -1) } : b,
      ),
    };
  }

  return { content, blanks };
}
