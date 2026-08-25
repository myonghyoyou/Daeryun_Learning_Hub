import { test } from "vitest";
import assert from "node:assert/strict";
import { canDismissConfirmModal } from "./modalDismissal.js";

test("no request in flight (togglingId null) is always dismissible", () => {
  assert.equal(canDismissConfirmModal({ pendingId: 1, togglingId: null }), true);
  assert.equal(canDismissConfirmModal({ pendingId: undefined, togglingId: null }), true);
});

test("a request in flight for the currently open modal's target blocks dismissal", () => {
  assert.equal(canDismissConfirmModal({ pendingId: 7, togglingId: 7 }), false);
});

test("a request in flight for a different target does not block this modal", () => {
  assert.equal(canDismissConfirmModal({ pendingId: 7, togglingId: 3 }), true);
});

test("id 0 in flight is still treated as 'in flight', not as falsy/absent", () => {
  assert.equal(canDismissConfirmModal({ pendingId: 0, togglingId: 0 }), false);
});
