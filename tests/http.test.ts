import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "../lib/domain.ts";
import { assertSameOrigin, errorResponse, readJson } from "../lib/http.ts";

test("JSON body limit measures actual UTF-8 bytes without trusting Content-Length", async () => {
  const request = new Request("https://app.example.test/api/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "界".repeat(30_000) }),
  });
  await assert.rejects(
    () => readJson(request),
    (error: unknown) =>
      error instanceof AppError &&
      error.status === 413 &&
      error.code === "REQUEST_TOO_LARGE",
  );
});

test("cross-site writes are rejected even when Origin is omitted", () => {
  const request = new Request("https://app.example.test/api/write", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
  });
  assert.throws(
    () => assertSameOrigin(request),
    (error: unknown) =>
      error instanceof AppError && error.code === "CROSS_ORIGIN_REQUEST_REJECTED",
  );
});

test("same-origin writes and non-browser requests remain supported", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("https://app.example.test/api/write", {
        method: "POST",
        headers: { origin: "https://app.example.test" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertSameOrigin(new Request("https://app.example.test/api/write", { method: "POST" })),
  );
});

test("error responses expose a stable request id without leaking internals", async () => {
  const response = errorResponse(
    new AppError(409, "STATE_CONFLICT", "State changed."),
    "request-test-1",
  );
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("x-request-id"), "request-test-1");
  assert.deepEqual(await response.json(), {
    error: {
      code: "STATE_CONFLICT",
      message: "State changed.",
      requestId: "request-test-1",
      retryable: false,
      details: null,
    },
  });
});
