import { z } from "zod";

export const MELBOURNE_TIME_ZONE = "Australia/Melbourne";

export const attendanceStatusSchema = z.enum(["present", "late", "absent"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const feedbackDraftSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    strengths: z.array(z.string().trim().min(1).max(160)).max(4),
    nextSteps: z.array(z.string().trim().min(1).max(160)).max(4),
    guardianMessageDraft: z.string().trim().min(1).max(900),
  })
  .strict();

export type FeedbackDraft = z.infer<typeof feedbackDraftSchema>;

export const completeClassSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    records: z
      .array(
        z
          .object({
            studentId: z.string().trim().min(1).max(100),
            status: attendanceStatusSchema,
          })
          .strict(),
      )
      .min(1)
      .max(40),
    rawClassNotes: z.string().trim().max(4_000).default(""),
    feedback: feedbackDraftSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.records.forEach((record, index) => {
      if (seen.has(record.studentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A student appears more than once.",
          path: ["records", index, "studentId"],
        });
      }
      seen.add(record.studentId);
    });
  });

export type CompleteClassInput = z.infer<typeof completeClassSchema>;

export const feedbackRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(100),
    rawNotes: z.string().trim().min(8).max(4_000),
  })
  .strict();

export function isBillable(status: AttendanceStatus): boolean {
  return status === "present" || status === "late";
}

export function makeFallbackFeedback(
  rawNotes: string,
  className: string,
): FeedbackDraft {
  const cleanNotes = rawNotes.replace(/\s+/g, " ").trim();
  const summary =
    cleanNotes.length <= 500
      ? cleanNotes
      : `${cleanNotes.slice(0, 497).trimEnd()}…`;

  return {
    summary,
    strengths: [],
    nextSteps: [
      "Review the teacher’s original note and add one specific next step before sharing.",
    ],
    guardianMessageDraft:
      `In today’s ${className} lesson, we covered the following: ${summary}`,
  };
}

export function melbourneDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function melbourneTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.hour}:${value.minute}`;
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
}

export function calculateAge(dateOfBirth: string, onDate: string): number {
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [year, month, day] = onDate.split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
