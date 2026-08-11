import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTrailing, nextBlankKey, designateBlank, releaseBlank, adjustBlankBoundary } from "./blankTokens.js";
import { segmentContent } from "./blankSegments.js";

function wordSeg(content, text) {
  return segmentContent(content, []).find((s) => s.type === "word" && s.text === text);
}

test("splits a common object particle off the core", () => {
  assert.deepEqual(splitTrailing("배관을"), { core: "배관", trailing: "을" });
  assert.deepEqual(splitTrailing("편성,"), { core: "편성", trailing: "," });
});

// 긴 조사를 먼저 떼어낸다 — "에서"를 "에"로 자르면 "서"가 core 에 남는다.
test("prefers the longest matching particle", () => {
  assert.deepEqual(splitTrailing("회사에서"), { core: "회사", trailing: "에서" });
});

// 조사가 없으면 통째로 core.
test("keeps the whole word when there is no trailing particle", () => {
  assert.deepEqual(splitTrailing("결산"), { core: "결산", trailing: "" });
});

// 조사 + 구두점이 함께 붙은 경우 둘 다 뗀다.
test("strips a particle and punctuation together", () => {
  assert.deepEqual(splitTrailing("배관을,"), { core: "배관", trailing: "을," });
});

// 조사로 끝나는 것처럼 보이는 단어를 자르지 않도록 최소 core 길이를 지킨다.
test("does not strip when it would leave an empty core", () => {
  assert.deepEqual(splitTrailing("을"), { core: "을", trailing: "" });
});

test("nextBlankKey returns the smallest unused b-number", () => {
  assert.equal(nextBlankKey([]), "b1");
  assert.equal(nextBlankKey(["b1", "b2"]), "b3");
  assert.equal(nextBlankKey(["b2"]), "b1", "빈 번호를 채운다");
});

test("designateBlank replaces a word with a marker and captures the answer", () => {
  const content = "예산의 3요소는 편성, 집행, 결산 이다.";
  const seg = wordSeg(content, "편성"); // 쉼표는 segmentContent가 이미 분리해 어절은 "편성"
  const next = designateBlank(content, [], seg);

  assert.equal(next.content, "예산의 3요소는 {{b1}}, 집행, 결산 이다.", "쉼표는 본문에 남는다");
  assert.deepEqual(next.blanks, [{ blankKey: "b1", answerText: "편성" }]);
});

test("designateBlank keeps a trailing particle in the content", () => {
  const content = "배관을 통하여";
  const seg = wordSeg(content, "배관을");
  const next = designateBlank(content, [], seg);

  assert.equal(next.content, "{{b1}}을 통하여");
  assert.deepEqual(next.blanks, [{ blankKey: "b1", answerText: "배관" }]);
});

test("designateBlank assigns the next free key", () => {
  const content = "{{b1}} 집행";
  const seg = wordSeg(content, "집행");
  const next = designateBlank(content, [{ blankKey: "b1", answerText: "편성" }], seg);

  assert.equal(next.content, "{{b1}} {{b2}}");
  assert.equal(next.blanks[1].blankKey, "b2");
});

// F3: 캐시된(낡은) wordSeg 오프셋으로 부르면 이미 삽입된 마커까지 잘라먹을 수 있다.
// content.slice(start, end) !== text 일 때는 아무것도 하지 않아야 한다.
test("designateBlank no-ops when wordSeg offsets are stale", () => {
  const content = "가나다 라마바 사아자";
  const w1 = wordSeg(content, "가나다"); // {start:0, end:3}
  const w2 = wordSeg(content, "라마바"); // 같은(원본) content 기준 — 첫 호출 뒤에는 낡는다

  const d1 = designateBlank(content, [], w1);
  assert.equal(d1.content, "{{b1}} 라마바 사아자");

  // w2 는 d1.content 기준으로는 더 이상 "라마바"를 가리키지 않는다(길이가 바뀌었으므로).
  const d2 = designateBlank(d1.content, d1.blanks, w2);
  assert.deepEqual(d2, d1, "낡은 오프셋은 무시하고 이전 상태를 그대로 반환해야 한다");
});

test("releaseBlank puts the answer text back and drops the blank", () => {
  const next = releaseBlank("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }], "b1");
  assert.equal(next.content, "배관을 통하여");
  assert.deepEqual(next.blanks, []);
});

// F4: blanks 에 없는 키는 무시해야 한다(마커를 지우고 빈 문자열로 바꿔치기하면 안 된다).
test("releaseBlank no-ops for an unknown key", () => {
  const content = "{{b1}} 나";
  const blanks = [];
  const next = releaseBlank(content, blanks, "b1");
  assert.deepEqual(next, { content, blanks });
});

// F5: String.replace(문자열, 문자열)은 "$&" 같은 치환 패턴을 해석한다. 정답 텍스트는
// 있는 그대로(리터럴로) 들어가야 한다 — 그렇지 않으면 이 정답을 등록한 사용자의 본문이
// 조용히 깨진다.
test("releaseBlank inserts the answer text literally, even when it looks like a replace pattern", () => {
  const next = releaseBlank("{{b1}} 나", [{ blankKey: "b1", answerText: "$&" }], "b1");
  assert.equal(next.content, "$& 나");
  assert.deepEqual(next.blanks, []);
});

// +1: 뒤 본문 글자를 정답으로 흡수 (조사를 정답에 다시 붙이고 싶을 때)
test("adjustBlankBoundary +1 absorbs the next content char into the answer", () => {
  const next = adjustBlankBoundary("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }], "b1", 1);
  assert.equal(next.content, "{{b1}} 통하여");
  assert.equal(next.blanks[0].answerText, "배관을");
});

// -1: 정답 마지막 글자를 본문으로 내보냄 (과분리 보정)
test("adjustBlankBoundary -1 pushes the last answer char back to content", () => {
  const next = adjustBlankBoundary("{{b1}} 통하여", [{ blankKey: "b1", answerText: "배관을" }], "b1", -1);
  assert.equal(next.content, "{{b1}}을 통하여");
  assert.equal(next.blanks[0].answerText, "배관");
});

// F1: 마커가 바로 붙어 있을 때 +1 이 옆 마커의 "{" 를 먹어버리면 그 마커는 영구히 깨진다.
test("adjustBlankBoundary +1 refuses to absorb into an adjacent marker", () => {
  const content = "{{b1}}{{b2}}";
  const blanks = [
    { blankKey: "b1", answerText: "x" },
    { blankKey: "b2", answerText: "y" },
  ];
  const next = adjustBlankBoundary(content, blanks, "b1", 1);
  assert.deepEqual(next, { content, blanks }, "이웃 마커를 깨는 대신 아무것도 하지 않아야 한다");
});

// F2: splitTrailing 이 구두점을 꼬리로 떼는 것과 대칭으로, +1 도 구두점을 정답에 흡수하면
// 안 된다("가," 처럼 채점 정답에 쉼표가 섞이면 정답 입력이 안 맞게 된다).
test("adjustBlankBoundary +1 refuses to absorb trailing punctuation", () => {
  const content = "{{b1}},더 있다";
  const blanks = [{ blankKey: "b1", answerText: "가" }];
  const next = adjustBlankBoundary(content, blanks, "b1", 1);
  assert.deepEqual(next, { content, blanks });
});

test("adjustBlankBoundary +1 no-ops at end of content", () => {
  const content = "{{b1}}";
  const blanks = [{ blankKey: "b1", answerText: "가" }];
  const next = adjustBlankBoundary(content, blanks, "b1", 1);
  assert.deepEqual(next, { content, blanks });
});

test("adjustBlankBoundary +1 no-ops when the next char is whitespace", () => {
  const content = "{{b1}} 나";
  const blanks = [{ blankKey: "b1", answerText: "가" }];
  const next = adjustBlankBoundary(content, blanks, "b1", 1);
  assert.deepEqual(next, { content, blanks });
});

test("adjustBlankBoundary -1 no-ops when the answer is already a single character", () => {
  const content = "{{b1}} 나";
  const blanks = [{ blankKey: "b1", answerText: "가" }];
  const next = adjustBlankBoundary(content, blanks, "b1", -1);
  assert.deepEqual(next, { content, blanks });
});

// 마커는 본문에 남아 있지만 blanks 목록에는 없는 불일치 상태(예: 상태 동기화 버그) —
// releaseBlank 처럼 조용히 무시해야 한다. 마커 바로 뒤를 일반 어절 글자("나")로 둬서,
// 공백/구두점/중괄호 가드가 아니라 "!blank" 가드 자체가 no-op 을 만드는지 검증한다
// (뒤가 공백이면 그 가드만으로도 no-op 이 되어 이 가드가 없어도 테스트가 통과해버린다).
test("adjustBlankBoundary no-ops for a key whose marker exists but has no blanks entry", () => {
  const content = "{{b1}}{{b2}}나";
  const blanks = [{ blankKey: "b1", answerText: "가" }];
  const next = adjustBlankBoundary(content, blanks, "b2", 1);
  assert.deepEqual(next, { content, blanks });
});

// 왕복 안정성: 여러 단어를 지정한 뒤 지정 순서와 다른 순서로 해제해도 본문은 원형(조사
// 포함) 그대로 복원되어야 한다.
test("round trip: designating several words then releasing them in a different order restores the original content", () => {
  const original = "배관을 통하여 편성, 집행, 결산 이다.";
  let state = { content: original, blanks: [] };

  state = designateBlank(state.content, state.blanks, wordSeg(state.content, "배관을"));
  state = designateBlank(state.content, state.blanks, wordSeg(state.content, "편성"));
  state = designateBlank(state.content, state.blanks, wordSeg(state.content, "집행"));

  // 지정한 순서(b1, b2, b3)와 다른 순서(b2, b1, b3)로 해제한다.
  state = releaseBlank(state.content, state.blanks, "b2");
  state = releaseBlank(state.content, state.blanks, "b1");
  state = releaseBlank(state.content, state.blanks, "b3");

  assert.equal(state.content, original);
  assert.deepEqual(state.blanks, []);
});
