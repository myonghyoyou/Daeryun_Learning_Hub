import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TAGS, MAX_TAG_LENGTH, parseTagsInput, normalizeTags, validateTags } from "./problemTags.js";

test("parseTagsInput splits on commas, trims whitespace, and drops empty entries", () => {
  assert.deepEqual(parseTagsInput(" 자바 , React ,, , TypeScript "), ["자바", "React", "TypeScript"]);
});

test("parseTagsInput returns an empty array for empty/undefined input", () => {
  assert.deepEqual(parseTagsInput(""), []);
  assert.deepEqual(parseTagsInput(undefined), []);
});

test("normalizeTags lowercases and de-duplicates case-insensitively, matching ProblemServiceImpl.normalizeTags", () => {
  assert.deepEqual(normalizeTags(["Java", "java", "JAVA", "React"]), ["java", "react"]);
});

test("normalizeTags preserves first-seen order", () => {
  assert.deepEqual(normalizeTags(["React", "Java", "react"]), ["react", "java"]);
});

test("MAX_TAGS/MAX_TAG_LENGTH match the server's bounds (ProblemServiceImpl)", () => {
  assert.equal(MAX_TAGS, 20);
  assert.equal(MAX_TAG_LENGTH, 100);
});

test("validateTags accepts up to 20 tags of up to 100 characters", () => {
  const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
  assert.equal(validateTags(tags), null);
  assert.equal(validateTags(["a".repeat(100)]), null);
});

test("validateTags rejects more than 20 tags", () => {
  const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
  assert.match(validateTags(tags), /20/);
});

test("validateTags rejects any tag longer than 100 characters", () => {
  assert.match(validateTags(["a".repeat(101)]), /100/);
});
