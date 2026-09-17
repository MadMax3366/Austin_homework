import "server-only";

import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import {
  AppError,
  feedbackDraftSchema,
  makeFallbackFeedback,
  melbourneDate,
} from "@/lib/domain";
import type { StaffUser } from "@/lib/server-auth";
import type { FeedbackDraftResult } from "@/lib/types";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 500 },
    strengths: {
      type: "array",
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    nextSteps: {
      type: "array",
      maxItems: 4,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    guardianMessageDraft: {
      type: "string",
      minLength: 1,
      maxLength: 900,
    },
  },
  required: ["summary", "strengths", "nextSteps", "guardianMessageDraft"],
  additionalProperties: false,
} as const;

const SENSITIVE_NOTE_PATTERN =
  /\b(diagnos(?:is|ed)|medication|medical condition|adhd|autism|self-harm)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeForProvider(value: string, names: string[]): string {
  let sanitized = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?61|0)[\d\s()-]{8,}/g, "[phone removed]")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "[date removed]");
  for (const name of names.filter((item) => item.trim().length >= 2)) {
    sanitized = sanitized.replace(
      new RegExp(escapeRegExp(name.trim()), "gi"),
      "[student]",
    );
  }
  return sanitized;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function fallback(
  code: string,
  message: string,
  safeNotes: string,
  className: string,
): FeedbackDraftResult {
  return {
    source: "fallback",
    draft: makeFallbackFeedback(safeNotes, className),
    warning: { code, message },
  };
}

async function consumeLimit(
  scope: "teacher_minute" | "session_day",
  subjectId: string,
  bucketStart: string,
  maximum: number,
): Promise<void> {
  const id = `${scope}:${subjectId}:${bucketStart}`;
  const result = await getD1()
    .prepare(
      `INSERT INTO ai_rate_limit_buckets
        (id, scope, subject_id, bucket_start, request_count, updated_at)
       VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(scope, subject_id, bucket_start) DO UPDATE SET
        request_count = request_count + 1,
        updated_at = CURRENT_TIMESTAMP
       WHERE request_count < ?
       RETURNING request_count`,
    )
    .bind(id, scope, subjectId, bucketStart, maximum)
    .first<{ requestCount: number }>();
  if (!result) {
    throw new AppError(
      429,
      "AI_RATE_LIMITED_LOCAL",
      "Too many feedback drafts were requested. Please wait and try again.",
    );
  }
}

async function recordGeneration(args: {
  actorId: string;
  sessionId: string;
  inputHash: string;
  result: FeedbackDraftResult;
  latencyMs: number;
}): Promise<void> {
  try {
    await getD1()
      .prepare(
        `INSERT INTO ai_generations
          (id, actor_id, lesson_session_id, input_hash, source,
           status, error_code, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        args.actorId,
        args.sessionId,
        args.inputHash,
        args.result.source,
        args.result.source === "ai" ? "succeeded" : "fallback",
        args.result.warning?.code ?? null,
        args.latencyMs,
      )
      .run();
  } catch (error) {
    console.error("AI generation metadata could not be recorded", error);
  }
}

export async function draftFeedback(
  staff: StaffUser,
  sessionId: string,
  rawNotes: string,
): Promise<FeedbackDraftResult> {
  if (staff.role !== "teacher") {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "Only teachers can draft class feedback.",
    );
  }

  const db = getD1();
  const session = await db
    .prepare(
      `SELECT cs.name AS className, ls.teacher_id AS teacherId, ls.status
       FROM lesson_sessions ls
       JOIN class_series cs ON cs.id = ls.class_series_id
       WHERE ls.id = ?
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ className: string; teacherId: string; status: string }>();
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Class session not found.");
  }
  if (session.teacherId !== staff.id) {
    throw new AppError(
      403,
      "SESSION_ACCESS_DENIED",
      "You are not assigned to this class session.",
    );
  }
  if (session.status !== "scheduled") {
    throw new AppError(
      409,
      "SESSION_NOT_EDITABLE",
      "Feedback can only be drafted for a scheduled class.",
    );
  }

  const names = await db
    .prepare(
      `SELECT display_name AS displayName
       FROM session_participants
       WHERE lesson_session_id = ? AND removed_at IS NULL`,
    )
    .bind(sessionId)
    .all<{ displayName: string }>();
  const safeNotes = sanitizeForProvider(
    rawNotes,
    names.results.map((row) => row.displayName),
  );
  const startedAt = Date.now();
  const inputHash = await sha256(`${sessionId}:${safeNotes}`);
  const minuteBucket = new Date().toISOString().slice(0, 16);

  await consumeLimit("teacher_minute", staff.id, minuteBucket, 5);
  await consumeLimit("session_day", sessionId, melbourneDate(), 20);

  const finish = async (result: FeedbackDraftResult) => {
    await recordGeneration({
      actorId: staff.id,
      sessionId,
      inputHash,
      result,
      latencyMs: Date.now() - startedAt,
    });
    return result;
  };

  if (SENSITIVE_NOTE_PATTERN.test(rawNotes)) {
    return finish(
      fallback(
        "AI_SENSITIVE_CONTENT",
        "Sensitive information was detected, so no external AI request was made.",
        safeNotes,
        session.className,
      ),
    );
  }
  if (!env.OPENAI_API_KEY) {
    return finish(
      fallback(
        "AI_NOT_CONFIGURED",
        "AI is not configured, so a safe editable draft was created locally.",
        safeNotes,
        session.className,
      ),
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OPENAI_MODEL ?? "gpt-5-mini",
        store: false,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Turn a teacher's rough class note into a concise editable family update. " +
                  "Use only facts in the note, never infer diagnoses or personal details, and do not make business decisions.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Class: ${session.className}\nTeacher note:\n${safeNotes}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "class_feedback_draft",
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
        max_output_tokens: 700,
      }),
    });

    if (!response.ok) {
      const code =
        response.status === 429
          ? "AI_PROVIDER_RATE_LIMITED"
          : response.status >= 500
            ? "AI_PROVIDER_UNAVAILABLE"
            : "AI_REQUEST_FAILED";
      return finish(
        fallback(
          code,
          "AI was unavailable, so a safe editable draft was created locally.",
          safeNotes,
          session.className,
        ),
      );
    }

    const payload: unknown = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      return finish(
        fallback(
          "AI_OUTPUT_INVALID",
          "AI returned an invalid response, so a safe editable draft was created locally.",
          safeNotes,
          session.className,
        ),
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(outputText);
    } catch {
      return finish(
        fallback(
          "AI_OUTPUT_INVALID",
          "AI returned invalid JSON, so a safe editable draft was created locally.",
          safeNotes,
          session.className,
        ),
      );
    }
    const parsed = feedbackDraftSchema.safeParse(decoded);
    if (!parsed.success) {
      return finish(
        fallback(
          "AI_OUTPUT_INVALID",
          "AI returned an invalid structure, so a safe editable draft was created locally.",
          safeNotes,
          session.className,
        ),
      );
    }
    return finish({ source: "ai", draft: parsed.data, warning: null });
  } catch (error) {
    const code =
      error instanceof DOMException && error.name === "AbortError"
        ? "AI_TIMEOUT"
        : "AI_PROVIDER_UNAVAILABLE";
    return finish(
      fallback(
        code,
        "AI was unavailable, so a safe editable draft was created locally.",
        safeNotes,
        session.className,
      ),
    );
  } finally {
    clearTimeout(timer);
  }
}
