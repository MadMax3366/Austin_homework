import assert from "node:assert/strict";
import test from "node:test";

import {
  GeminiProviderError,
  generateGeminiJson,
} from "../lib/gemini-client.ts";

const BASE_ARGS = {
  apiKey: "test-secret-key",
  model: "gemini-test-model",
  systemInstruction: "System policy.",
  prompt: "Untrusted user content.",
  schema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
  maxOutputTokens: 512,
  timeoutMs: 100,
};

function providerResponse(
  text: string,
  finishReason = "STOP",
  extra: Record<string, unknown> = {},
): Response {
  return Response.json({
    candidates: [
      {
        finishReason,
        content: { parts: [{ text }] },
      },
    ],
    ...extra,
  });
}

async function expectCode(
  promise: Promise<unknown>,
  code: GeminiProviderError["code"],
): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof GeminiProviderError && error.code === code,
  );
}

test("Gemini request keeps the key in a header and returns structured JSON", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const result = await generateGeminiJson({
    ...BASE_ARGS,
    fetchImpl: (async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return providerResponse('{"ok":true}');
    }) as typeof fetch,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requestedUrl.includes(BASE_ARGS.apiKey), false);
  assert.match(requestedUrl, /models\/gemini-test-model:generateContent$/);
  const headers = new Headers(requestedInit?.headers);
  assert.equal(headers.get("x-goog-api-key"), BASE_ARGS.apiKey);
  const body = JSON.parse(String(requestedInit?.body));
  assert.equal(body.systemInstruction.parts[0].text, BASE_ARGS.systemInstruction);
  assert.equal(body.contents[0].parts[0].text, BASE_ARGS.prompt);
  assert.deepEqual(body.generationConfig.responseJsonSchema, BASE_ARGS.schema);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "low");
});

test("Gemini client rejects invalid models before making a request", async () => {
  let called = false;
  await expectCode(
    generateGeminiJson({
      ...BASE_ARGS,
      model: "https://attacker.invalid/model",
      fetchImpl: (async () => {
        called = true;
        return providerResponse('{"ok":true}');
      }) as typeof fetch,
    }),
    "AI_MODEL_INVALID",
  );
  assert.equal(called, false);
});

test("Gemini client classifies rate limits and provider outages", async () => {
  await expectCode(
    generateGeminiJson({
      ...BASE_ARGS,
      fetchImpl: (async () => new Response("limited", { status: 429 })) as typeof fetch,
    }),
    "AI_PROVIDER_RATE_LIMITED",
  );
  await expectCode(
    generateGeminiJson({
      ...BASE_ARGS,
      fetchImpl: (async () => new Response("down", { status: 503 })) as typeof fetch,
    }),
    "AI_PROVIDER_UNAVAILABLE",
  );
});

test("Gemini client rejects safety blocks, truncation, and invalid JSON", async () => {
  await expectCode(
    generateGeminiJson({
      ...BASE_ARGS,
      fetchImpl: (async () =>
        Response.json({ promptFeedback: { blockReason: "SAFETY" } })) as typeof fetch,
    }),
    "AI_OUTPUT_BLOCKED",
  );
  await expectCode(
    generateGeminiJson({
      ...BASE_ARGS,
      fetchImpl: (async () =>
        providerResponse('{"ok":true}', "MAX_TOKENS")) as typeof fetch,
    }),
    "AI_OUTPUT_INVALID",
  );
  await expectCode(
    generateGeminiJson({
      ...BASE_ARGS,
      fetchImpl: (async () => providerResponse("not json")) as typeof fetch,
    }),
    "AI_OUTPUT_INVALID",
  );
});

test("Gemini client aborts a provider call at the configured deadline", async () => {
  await expectCode(
    generateGeminiJson({
      ...BASE_ARGS,
      timeoutMs: 5,
      fetchImpl: ((_, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })) as typeof fetch,
    }),
    "AI_TIMEOUT",
  );
});
