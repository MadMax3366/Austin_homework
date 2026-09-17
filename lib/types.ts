import type { AttendanceStatus, FeedbackDraft } from "@/lib/domain";

export type SessionSummary = {
  id: string;
  title: string;
  subject: string;
  room: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "completed" | "cancelled";
  version: number;
  rosterCount: number;
  timing: "past" | "active" | "upcoming";
};

export type RosterStudent = {
  id: string;
  name: string;
  initials: string;
  age: number;
  balance: number;
  isNew: boolean;
  attendanceStatus: AttendanceStatus | null;
  billingStatus:
    | "charged"
    | "not_charged"
    | "pending_insufficient_credit"
    | null;
};

export type TeacherWorkspaceData = {
  today: string;
  timeZone: "Australia/Melbourne";
  staff: {
    id: string;
    displayName: string;
    role: "teacher";
  };
  sessions: SessionSummary[];
  selectedSession: SessionSummary | null;
  roster: RosterStudent[];
  rawClassNotes: string;
  feedback: FeedbackDraft | null;
};

export type CompleteClassResult = {
  sessionId: string;
  status: "completed";
  version: number;
  chargedCount: number;
  absentCount: number;
  pendingCreditCount: number;
  idempotentReplay: boolean;
};

export type FeedbackDraftResult = {
  source: "ai" | "fallback";
  draft: FeedbackDraft;
  warning: { code: string; message: string } | null;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    retryable?: boolean;
    details: unknown;
  };
};
