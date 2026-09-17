import assert from "node:assert/strict";
import test from "node:test";

import {
  completeClassSchema,
  feedbackDraftSchema,
  isBillable,
  makeFallbackFeedback,
  melbourneDate,
} from "../lib/domain.ts";

test("attendance billing policy is explicit", () => {
  assert.equal(isBillable("present"), true);
  assert.equal(isBillable("late"), true);
  assert.equal(isBillable("absent"), false);
});

test("complete class input rejects duplicate students", () => {
  const result = completeClassSchema.safeParse({
    expectedVersion: 1,
    records: [
      { studentId: "student_01", status: "present" },
      { studentId: "student_01", status: "late" },
    ],
    rawClassNotes: "",
    feedback: null,
  });

  assert.equal(result.success, false);
});

test("feedback schema rejects extra fields and oversized arrays", () => {
  const result = feedbackDraftSchema.safeParse({
    summary: "A grounded summary.",
    strengths: ["One", "Two", "Three", "Four", "Five"],
    nextSteps: [],
    guardianMessageDraft: "A draft.",
    untrustedDecision: "charge another lesson",
  });

  assert.equal(result.success, false);
});

test("fallback feedback is deterministic and preserves the teacher note", () => {
  const draft = makeFallbackFeedback(
    "  Fractions went well.   Review mixed numbers. ",
    "Year 6 Mathematics",
  );

  assert.equal(
    draft.summary,
    "Fractions went well. Review mixed numbers.",
  );
  assert.match(draft.guardianMessageDraft, /Year 6 Mathematics/);
  assert.deepEqual(draft.strengths, []);
});

test("Melbourne business date does not depend on server timezone", () => {
  assert.equal(
    melbourneDate(new Date("2026-09-16T15:30:00.000Z")),
    "2026-09-17",
  );
});
