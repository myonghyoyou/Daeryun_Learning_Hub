import { test } from "vitest";
import assert from "node:assert/strict";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  validateImageFile,
} from "./problemImageValidation.js";

test("bounds match ProblemImageServiceImpl's allowlists and 5MB cap", () => {
  assert.deepEqual(ALLOWED_IMAGE_EXTENSIONS, ["png", "jpg", "jpeg", "gif", "webp"]);
  assert.deepEqual(ALLOWED_IMAGE_CONTENT_TYPES, ["image/png", "image/jpeg", "image/gif", "image/webp"]);
  assert.equal(MAX_IMAGE_SIZE_BYTES, 5 * 1024 * 1024);
});

test("validateImageFile accepts a well-formed png/jpg/jpeg/gif/webp under the size cap", () => {
  for (const [name, type] of [
    ["photo.png", "image/png"],
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["photo.gif", "image/gif"],
    ["photo.webp", "image/webp"],
  ]) {
    assert.equal(validateImageFile({ name, type, size: 1024 }), null);
  }
});

test("validateImageFile rejects a file over 5MB", () => {
  assert.equal(
    validateImageFile({ name: "big.png", type: "image/png", size: 5 * 1024 * 1024 + 1 }),
    "이미지 크기는 5MB를 초과할 수 없습니다.",
  );
});

test("validateImageFile accepts a file exactly at the 5MB cap", () => {
  assert.equal(validateImageFile({ name: "exact.png", type: "image/png", size: 5 * 1024 * 1024 }), null);
});

test("validateImageFile rejects a disallowed content type (e.g. svg) even with an allowed-looking name", () => {
  assert.match(
    validateImageFile({ name: "evil.svg", type: "image/svg+xml", size: 100 }),
    /png, jpg, jpeg, gif, webp/,
  );
});

test("validateImageFile rejects a mismatched extension even when Content-Type is allowed", () => {
  assert.match(validateImageFile({ name: "evil.exe", type: "image/png", size: 100 }), /png, jpg, jpeg, gif, webp/);
});

test("validateImageFile rejects a missing file", () => {
  assert.equal(validateImageFile(null), "이미지 파일을 선택하세요.");
  assert.equal(validateImageFile(undefined), "이미지 파일을 선택하세요.");
});
