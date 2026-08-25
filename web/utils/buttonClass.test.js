import { test } from "vitest";
import assert from "node:assert/strict";
import { buttonClass, BUTTON_VARIANTS, BUTTON_SIZES } from "./buttonClass.js";

/*
 * QA D6: Button 컴포넌트는 <button> 으로 고정돼 있어 <Link> 를 감쌀 수 없다. 그래서
 * 버튼처럼 보이는 링크마다 스타일 문자열을 손으로 복제했고, 세 곳 중 두 곳이
 * focus-visible 유틸리티를 빠뜨려 브라우저 기본 포커스 링에 의존했다.
 *
 * 이 프로젝트에는 jsdom 이 없어 컴포넌트 렌더링 테스트를 할 수 없다. 대신 클래스
 * 문자열을 만드는 순수 함수를 뽑아 여기서 고정한다 — 그래야 네 번째 링크가 생겨도
 * 같은 실수가 반복되지 않는다.
 */
test("every variant carries the design system focus ring", () => {
  for (const variant of BUTTON_VARIANTS) {
    const cls = buttonClass({ variant });
    assert.ok(cls.includes("focus-visible:outline-[3px]"), `${variant}: 3px 아웃라인 누락`);
    assert.ok(cls.includes("focus-visible:outline-offset-2"), `${variant}: 2px offset 누락`);
    assert.ok(cls.includes("focus-visible:outline-brand-aqua"), `${variant}: Aqua 색상 누락`);
  }
});

test("every size carries the design system focus ring", () => {
  for (const size of BUTTON_SIZES) {
    assert.ok(
      buttonClass({ size }).includes("focus-visible:outline-[3px]"),
      `${size}: 3px 아웃라인 누락`
    );
  }
});

test("applies the requested variant and size classes", () => {
  const cls = buttonClass({ variant: "secondary", size: "sm" });
  assert.ok(cls.includes("border-line-strong"), "secondary 배경/테두리 누락");
  assert.ok(cls.includes("h-8"), "sm 높이 누락");
});

test("defaults to the primary variant at md size", () => {
  const cls = buttonClass();
  assert.ok(cls.includes("bg-action-primary-bg"), "primary 배경 누락");
  assert.ok(cls.includes("h-[38px]"), "md 높이 누락");
});

test("appends caller supplied classes last so they can override", () => {
  assert.ok(buttonClass({ className: "w-full" }).endsWith("w-full"));
});

// 호출자가 오타를 내면 조용히 스타일 없는 버튼이 나가는 대신 즉시 드러나야 한다.
test("rejects an unknown variant or size", () => {
  assert.throws(() => buttonClass({ variant: "danger" }), /variant/);
  assert.throws(() => buttonClass({ size: "xl" }), /size/);
});
