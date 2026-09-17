import "server-only";

import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import {
  AppError,
  feedbackDraftSchema,
  makeFallbackFeedback,
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

function redactObviousPii(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?61|0)[\d\s()-]{8,}/g, "[phone removed]");
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

function warning(
  code: string,
  message: string,
  rawNotes: string,
  className: string,
): FeedbackDraftResult {
  return {
    source: "fallback",
    draft: makeFallbackFeedback(rawNotes, className),
    warning: { code, message },
  };
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

  const session = await getD1()
    .prepare(
      `SELECT cs.name AS className, ls.teacher_id AS teacherId
       FROM lesson_sessions ls
       JOIN class_series cs ON cs.id = ls.class_series_id
       WHERE ls.id = ?
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ className: string; teacherId: string }>();

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

  if (!env.OPENAI_API_KEY) {
    return warning(
      "AI_NOT_CONFIGURED",
      "AI is not configured, so a safe editable draft was created locally.",
      rawNotes,
      session.className,
    );
  }

  const safeNotes = redactObviousPii(rawNotes);
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
          ? "AI_RATE_LIMITED"
          : response.status >= 500
            ? "AI_PROVIDER_UNAVAILABLE"
            : "AI_REQUEST_FAILED";
      return warning(
        code,
        "AI was unavailable, so a safe editable draft was created locally.",
        rawNotes,
        session.className,
      );
    }

    const payload: unknown = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      return warning(
        "AI_OUTPUT_INVALID",
        "AI returned an invalid response, so a safe editable draft was created locally.",
        rawNotes,
        session.className,
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(outputText);
    } catch {
      return warning(
        "AI_OUTPUT_INVALID",
        "AI returned an invalid response, so a safe editable draft was created locally.",
        rawNotes,
        session.className,
      );
    }
    const parsed = feedbackDraftSchema.safeParse(decoded);
    if (!parsed.success) {
      return warning(
        "AI_OUTPUT_INVALID",
        "AI returned an invalid response, so a safe editable draft was created locally.",
        rawNotes,
        session.className,
      );
    }

    return { source: "ai", draft: parsed.data, warning: null };
  } catch (error) {
    const code =
      error instanceof DOMException && error.name === "AbortError"
        ? "AI_TIMEOUT"
        : "AI_PROVIDER_UNAVAILABLE";
    return warning(
      code,
      "AI was unavailable, so a safe editable draft was created locally.",
      rawNotes,
      session.className,
    );
  } finally {
    clearTimeout(timer);
  }
}
