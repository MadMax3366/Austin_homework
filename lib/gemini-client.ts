export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export type GeminiProviderErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_MODEL_INVALID"
  | "AI_TIMEOUT"
  | "AI_PROVIDER_RATE_LIMITED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_REQUEST_FAILED"
  | "AI_OUTPUT_BLOCKED"
  | "AI_OUTPUT_INVALID";

export class GeminiProviderError extends Error {
  readonly code: GeminiProviderErrorCode;

  constructor(code: GeminiProviderErrorCode, message: string) {
    super(message);
    this.name = "GeminiProviderError";
    this.code = code;
  }
}

type JsonSchema = Readonly<Record<string, unknown>>;

type GenerateGeminiJsonArgs = {
  apiKey: string;
  model?: string;
  systemInstruction: string;
  prompt: string;
  schema: JsonSchema;
  maxOutputTokens: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

function normalizeModel(value?: string): string {
  const model = (value?.trim() || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
  if (!MODEL_PATTERN.test(model)) {
    throw new GeminiProviderError(
      "AI_MODEL_INVALID",
      "The configured Gemini model name is invalid.",
    );
  }
  return model;
}

function providerCode(status: number): GeminiProviderErrorCode {
  if (status === 429) return "AI_PROVIDER_RATE_LIMITED";
  if (status >= 500) return "AI_PROVIDER_UNAVAILABLE";
  return "AI_REQUEST_FAILED";
}

function responseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;
  const candidate = candidates[0];
  if (!candidate || typeof candidate !== "object") return null;
  const content = (candidate as { content?: unknown }).content;
  if (!content || typeof content !== "object") return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .filter(
      (part): part is { text: string } =>
        Boolean(
          part &&
            typeof part === "object" &&
            typeof (part as { text?: unknown }).text === "string" &&
            (part as { thought?: unknown }).thought !== true,
        ),
    )
    .map((part) => part.text)
    .join("")
    .trim();
  return text || null;
}

function finishReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;
  const candidate = candidates[0];
  if (!candidate || typeof candidate !== "object") return null;
  const reason = (candidate as { finishReason?: unknown }).finishReason;
  return typeof reason === "string" ? reason : null;
}

function wasBlocked(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const promptFeedback = (payload as { promptFeedback?: unknown }).promptFeedback;
  if (
    promptFeedback &&
    typeof promptFeedback === "object" &&
    typeof (promptFeedback as { blockReason?: unknown }).blockReason === "string"
  ) {
    return true;
  }
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return false;
  const finishReason = (candidates[0] as { finishReason?: unknown } | undefined)
    ?.finishReason;
  return finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT";
}

export async function generateGeminiJson({
  apiKey,
  model: rawModel,
  systemInstruction,
  prompt,
  schema,
  maxOutputTokens,
  timeoutMs,
  fetchImpl = fetch,
}: GenerateGeminiJsonArgs): Promise<unknown> {
  const key = apiKey.trim();
  if (!key) {
    throw new GeminiProviderError(
      "AI_NOT_CONFIGURED",
      "Gemini is not configured.",
    );
  }
  const model = normalizeModel(rawModel);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
      },
    );

    if (!response.ok) {
      throw new GeminiProviderError(
        providerCode(response.status),
        `Gemini returned HTTP ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GeminiProviderError(
        "AI_OUTPUT_INVALID",
        "Gemini returned a non-JSON response envelope.",
      );
    }

    const reason = finishReason(payload);
    if (wasBlocked(payload)) {
      throw new GeminiProviderError(
        "AI_OUTPUT_BLOCKED",
        "Gemini blocked the structured response.",
      );
    }
    if (reason !== "STOP") {
      throw new GeminiProviderError(
        "AI_OUTPUT_INVALID",
        `Gemini stopped before completing the structured response (${reason ?? "unknown"}).`,
      );
    }

    const text = responseText(payload);
    if (!text) {
      throw new GeminiProviderError(
        "AI_OUTPUT_INVALID",
        "Gemini did not return structured text.",
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new GeminiProviderError(
        "AI_OUTPUT_INVALID",
        "Gemini returned invalid structured JSON.",
      );
    }
  } catch (error) {
    if (error instanceof GeminiProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new GeminiProviderError("AI_TIMEOUT", "Gemini timed out.");
    }
    throw new GeminiProviderError(
      "AI_PROVIDER_UNAVAILABLE",
      "Gemini could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
}
