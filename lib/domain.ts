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

export const billingResolutionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    action: z.enum(["charge", "waive"]),
    note: z.string().trim().min(3).max(500),
  })
  .strict();

export type BillingResolutionInput = z.infer<typeof billingResolutionSchema>;

const idField = z.string().trim().min(1).max(120);
const noteField = z.string().trim().min(2).max(1_000);
const strictCommand = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).strict();

export const platformCommandSchema = z.discriminatedUnion("action", [
  strictCommand({
    action: z.literal("create_inquiry"),
    studentName: z.string().trim().min(2).max(120),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    guardianName: z.string().trim().min(2).max(120),
    guardianEmail: z.string().email().max(240),
    guardianPhone: z.string().trim().min(6).max(40),
    source: z.string().trim().min(2).max(80),
    notes: z.string().trim().max(2_000).default(""),
  }),
  strictCommand({
    action: z.literal("schedule_trial"),
    inquiryId: idField,
    teacherId: idField,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    room: z.string().trim().min(1).max(80),
  }),
  strictCommand({
    action: z.literal("record_trial_outcome"),
    trialBookingId: idField,
    outcome: z.enum(["attended", "no_show", "cancelled"]),
    decision: z.enum(["enrol", "follow_up", "not_fit"]),
    notes: noteField,
  }),
  strictCommand({
    action: z.literal("convert_inquiry"),
    inquiryId: idField,
    classSeriesId: idField,
    creditQuantity: z.number().int().positive().max(500),
    amountCents: z.number().int().positive().max(10_000_000),
  }),
  strictCommand({
    action: z.literal("create_order"),
    studentId: idField,
    creditQuantity: z.number().int().positive().max(500),
    amountCents: z.number().int().positive().max(10_000_000),
    description: z.string().trim().min(2).max(240),
  }),
  strictCommand({
    action: z.literal("enroll_student"),
    studentId: idField,
    classSeriesId: idField,
  }),
  strictCommand({
    action: z.literal("end_enrollment"),
    enrollmentId: idField,
    reason: noteField,
  }),
  strictCommand({
    action: z.literal("transfer_student_owner"),
    studentId: idField,
    newOwnerId: idField,
  }),
  strictCommand({
    action: z.literal("request_teacher_leave"),
    teacherId: idField.optional(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: noteField,
  }),
  strictCommand({
    action: z.literal("decide_teacher_leave"),
    leaveRequestId: idField,
    approve: z.boolean(),
  }),
  strictCommand({
    action: z.literal("assign_substitute"),
    leaveRequestId: idField,
    sessionId: idField,
    substituteTeacherId: idField,
    reason: noteField,
  }),
  strictCommand({
    action: z.literal("sandbox_pay_order"),
    orderId: idField,
    providerEventId: idField,
  }),
  strictCommand({
    action: z.literal("complete_follow_up"),
    taskId: idField,
    note: noteField,
  }),
  strictCommand({
    action: z.literal("request_refund"),
    orderId: idField,
    amountCents: z.number().int().positive().max(10_000_000),
    reason: noteField,
  }),
  strictCommand({
    action: z.literal("approve_refund"),
    refundId: idField,
    approve: z.boolean(),
    note: noteField,
  }),
  strictCommand({
    action: z.literal("approve_payroll_period"),
    payrollPeriodId: idField,
  }),
  strictCommand({
    action: z.literal("mark_payroll_paid"),
    payrollPeriodId: idField,
  }),
  strictCommand({
    action: z.literal("process_outbox"),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  strictCommand({
    action: z.literal("request_support_session"),
    reason: noteField,
    scope: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    minutes: z.number().int().min(5).max(120),
  }),
  strictCommand({
    action: z.literal("approve_support_session"),
    supportSessionId: idField,
    minutes: z.number().int().min(5).max(120),
  }),
  strictCommand({
    action: z.literal("update_setting"),
    key: z.string().trim().min(2).max(100),
    value: z.unknown(),
  }),
]);

export type PlatformCommandInput = z.infer<typeof platformCommandSchema>;

export const faqQuestionSchema = z
  .object({
    question: z.string().trim().min(3).max(1_000),
    studentId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const faqDecisionSchema = z
  .object({
    resolution: z.enum(["answer", "handoff"]),
    category: z.enum([
      "schedule",
      "trial",
      "credits",
      "attendance",
      "feedback",
      "payment",
      "account",
      "other",
    ]),
    faqId: z.string().trim().min(1).max(80).nullable(),
    handoffQueue: z.enum(["operations", "billing", "teaching", "technical"]),
    reason: z.string().trim().min(1).max(300),
  })
  .strict();

export type FaqQuestionInput = z.infer<typeof faqQuestionSchema>;
export type FaqDecision = z.infer<typeof faqDecisionSchema>;

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

export function weekRangeForDate(date: string): {
  startsOn: string;
  endsOn: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid business date.");
  }
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(value);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return {
    startsOn: monday.toISOString().slice(0, 10),
    endsOn: sunday.toISOString().slice(0, 10),
  };
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
