import "server-only";

import { getD1 } from "@/db";
import {
  AppError,
  calculateAge,
  feedbackDraftSchema,
  melbourneDate,
  melbourneTime,
  weekRangeForDate,
} from "@/lib/domain";
import type { StaffUser } from "@/lib/server-auth";
import type {
  RosterStudent,
  SessionSummary,
  TeacherWorkspaceData,
} from "@/lib/types";

type SessionRow = {
  id: string;
  title: string;
  subject: string;
  room: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: SessionSummary["status"];
  kind: SessionSummary["kind"];
  version: number;
  rosterCount: number;
};

type RosterRow = {
  id: string;
  name: string;
  dateOfBirth: string;
  balance: number;
  isNew: number;
  attendanceStatus: RosterStudent["attendanceStatus"] | null;
  billingStatus: RosterStudent["billingStatus"];
  source: "enrollment" | "trial" | "makeup" | "manual";
  sessionKind: SessionSummary["kind"];
};

function timingFor(
  date: string,
  startTime: string,
  endTime: string,
  now: Date,
): SessionSummary["timing"] {
  const today = melbourneDate(now);
  const current = melbourneTime(now);
  if (date < today || (date === today && endTime <= current)) return "past";
  if (date > today || startTime > current) return "upcoming";
  return "active";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function mapSession(row: SessionRow, now: Date): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    room: row.room,
    date: row.sessionDate,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    kind: row.kind,
    version: Number(row.version),
    rosterCount: Number(row.rosterCount),
    timing: timingFor(row.sessionDate, row.startTime, row.endTime, now),
  };
}

export async function loadTeacherWorkspace(
  staff: StaffUser,
  selectedSessionId?: string | null,
  now = new Date(),
): Promise<TeacherWorkspaceData> {
  if (staff.role !== "teacher") {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "The teacher workspace is only available to teachers.",
    );
  }

  const db = getD1();
  const today = melbourneDate(now);
  const week = weekRangeForDate(today);
  const [sessionResult, payrollPeriod, payrollEntries] = await Promise.all([
    db.prepare(
      `SELECT
        ls.id,
        cs.name AS title,
        cs.subject,
        cs.room,
        ls.session_date AS sessionDate,
        ls.local_start_time AS startTime,
        ls.local_end_time AS endTime,
        ls.status,
        ls.session_kind AS kind,
        ls.version,
        COUNT(participant.id) AS rosterCount
       FROM lesson_sessions ls
       JOIN class_series cs ON cs.id = ls.class_series_id
       LEFT JOIN session_participants participant
        ON participant.lesson_session_id = ls.id
        AND participant.removed_at IS NULL
       WHERE ls.teacher_id = ?
        AND ls.session_date BETWEEN ? AND ?
       GROUP BY
        ls.id, cs.name, cs.subject, cs.room, ls.session_date,
        ls.local_start_time, ls.local_end_time, ls.status,ls.session_kind,ls.version
       ORDER BY ls.session_date,ls.local_start_time`,
    )
    .bind(staff.id, week.startsOn, week.endsOn)
    .all<SessionRow>(),
    db.prepare(
      `SELECT period.id,period.starts_on AS startsOn,period.ends_on AS endsOn,
              period.status,
              COALESCE(SUM(entry.base_amount_cents+entry.adjustment_cents),0) AS amountCents
       FROM payroll_periods period
       LEFT JOIN payroll_entries entry
         ON entry.payroll_period_id=period.id AND entry.teacher_id=?
       WHERE period.starts_on<=? AND period.ends_on>=?
       GROUP BY period.id ORDER BY period.starts_on DESC LIMIT 1`,
    ).bind(staff.id, today, today).first<{
      id: string;
      startsOn: string;
      endsOn: string;
      status: "open" | "approved" | "paid";
      amountCents: number;
    }>(),
    db.prepare(
      `SELECT entry.id,session.session_date AS sessionDate,
              series.name AS className,entry.session_kind AS kind,
              entry.base_amount_cents+entry.adjustment_cents AS amountCents,
              entry.status
       FROM payroll_entries entry
       JOIN lesson_sessions session ON session.id=entry.lesson_session_id
       JOIN class_series series ON series.id=session.class_series_id
       WHERE entry.teacher_id=? ORDER BY session.session_date DESC LIMIT 12`,
    ).bind(staff.id).all<{
      id: string;
      sessionDate: string;
      className: string;
      kind: string;
      amountCents: number;
      status: string;
    }>(),
  ]);

  const payroll: TeacherWorkspaceData["payroll"] = {
    currentPeriod: payrollPeriod
      ? {
          id: payrollPeriod.id,
          startsOn: payrollPeriod.startsOn,
          endsOn: payrollPeriod.endsOn,
          status: payrollPeriod.status,
        }
      : null,
    currentAmountCents: Number(payrollPeriod?.amountCents ?? 0),
    recentEntries: payrollEntries.results.map((entry) => ({
      ...entry,
      amountCents: Number(entry.amountCents),
    })),
  };

  const sessions = sessionResult.results.map((row) => mapSession(row, now));
  let selectedSession: SessionSummary | null = null;

  if (selectedSessionId) {
    selectedSession =
      sessions.find((session) => session.id === selectedSessionId) ?? null;
    if (!selectedSession) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Class session not found.");
    }
  } else {
    selectedSession =
      sessions.find(
        (session) =>
          session.timing === "active" && session.status === "scheduled",
      ) ??
      sessions.find((session) => session.status === "scheduled") ??
      sessions[0] ??
      null;
  }

  if (!selectedSession) {
    return {
      today,
      timeZone: "Australia/Melbourne",
      staff: {
        id: staff.id,
        displayName: staff.displayName,
        role: "teacher",
      },
      sessions,
      selectedSession: null,
      roster: [],
      rawClassNotes: "",
      feedback: null,
      payroll,
    };
  }

  const [detail, rosterResult] = await Promise.all([
    db
      .prepare(
        `SELECT raw_class_notes AS rawClassNotes, feedback_json AS feedbackJson
         FROM lesson_sessions
         WHERE id = ? AND teacher_id = ?
         LIMIT 1`,
      )
      .bind(selectedSession.id, staff.id)
      .first<{ rawClassNotes: string | null; feedbackJson: string | null }>(),
    db
      .prepare(
        `SELECT
          participant.student_id AS id,
          participant.display_name AS name,
          participant.date_of_birth AS dateOfBirth,
          COALESCE(SUM(ct.quantity), 0) AS balance,
          participant.is_new AS isNew,
          participant.source,
          ls.session_kind AS sessionKind,
          a.status AS attendanceStatus,
          a.billing_status AS billingStatus
         FROM lesson_sessions ls
         JOIN session_participants participant
          ON participant.lesson_session_id = ls.id
          AND participant.removed_at IS NULL
         JOIN credit_accounts ca ON ca.id = participant.credit_account_id
         LEFT JOIN credit_transactions ct ON ct.account_id = participant.credit_account_id
         LEFT JOIN attendance a
          ON a.lesson_session_id = ls.id
          AND a.student_id = participant.student_id
         WHERE ls.id = ?
          AND ls.teacher_id = ?
         GROUP BY
          participant.student_id, participant.display_name,
          participant.date_of_birth, participant.is_new,
          participant.source,participant.sort_order,ls.session_date,
          ls.session_kind,a.status,a.billing_status
         ORDER BY participant.sort_order, participant.display_name`,
      )
      .bind(selectedSession.id, staff.id)
      .all<RosterRow>(),
  ]);

  const roster = rosterResult.results.map<RosterStudent>((row) => ({
    id: row.id,
    name: row.name,
    initials: initials(row.name),
    age: calculateAge(row.dateOfBirth, selectedSession.date),
    balance: Number(row.balance),
    isNew: Boolean(row.isNew),
    billingPolicy:
      row.source === "trial" || row.sessionKind === "trial"
        ? "trial_free"
        : "billable",
    attendanceStatus: row.attendanceStatus,
    billingStatus: row.billingStatus,
  }));

  let feedback = null;
  if (detail?.feedbackJson) {
    try {
      const parsed = feedbackDraftSchema.safeParse(JSON.parse(detail.feedbackJson));
      if (parsed.success) feedback = parsed.data;
    } catch {
      feedback = null;
    }
  }

  return {
    today,
    timeZone: "Australia/Melbourne",
    staff: {
      id: staff.id,
      displayName: staff.displayName,
      role: "teacher",
    },
    sessions,
    selectedSession,
    roster,
    rawClassNotes: detail?.rawClassNotes ?? "",
    feedback,
    payroll,
  };
}
