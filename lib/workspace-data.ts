import "server-only";

import { getD1 } from "@/db";
import {
  AppError,
  calculateAge,
  feedbackDraftSchema,
  melbourneDate,
  melbourneTime,
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
  const sessionResult = await db
    .prepare(
      `SELECT
        ls.id,
        cs.name AS title,
        cs.subject,
        cs.room,
        ls.session_date AS sessionDate,
        ls.local_start_time AS startTime,
        ls.local_end_time AS endTime,
        ls.status,
        ls.version,
        COUNT(e.id) AS rosterCount
       FROM lesson_sessions ls
       JOIN class_series cs ON cs.id = ls.class_series_id
       LEFT JOIN enrollments e
        ON e.class_series_id = ls.class_series_id
        AND e.status = 'active'
        AND e.starts_on <= ls.session_date
        AND (e.ends_on IS NULL OR e.ends_on >= ls.session_date)
       WHERE ls.teacher_id = ?
        AND ls.session_date = ?
       GROUP BY
        ls.id, cs.name, cs.subject, cs.room, ls.session_date,
        ls.local_start_time, ls.local_end_time, ls.status, ls.version
       ORDER BY ls.local_start_time`,
    )
    .bind(staff.id, today)
    .all<SessionRow>();

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
          s.id,
          COALESCE(s.preferred_name, s.legal_name) AS name,
          s.date_of_birth AS dateOfBirth,
          COALESCE(SUM(ct.quantity), 0) AS balance,
          CASE WHEN EXISTS (
            SELECT 1
            FROM attendance previous_attendance
            JOIN lesson_sessions previous_session
              ON previous_session.id = previous_attendance.lesson_session_id
            WHERE previous_attendance.student_id = s.id
              AND previous_session.session_date < ls.session_date
              AND previous_attendance.status IN ('present', 'late')
          ) THEN 0 ELSE 1 END AS isNew,
          a.status AS attendanceStatus,
          a.billing_status AS billingStatus
         FROM lesson_sessions ls
         JOIN enrollments e
          ON e.class_series_id = ls.class_series_id
          AND e.status = 'active'
          AND e.starts_on <= ls.session_date
          AND (e.ends_on IS NULL OR e.ends_on >= ls.session_date)
         JOIN students s ON s.id = e.student_id
         JOIN credit_accounts ca ON ca.student_id = s.id
         LEFT JOIN credit_transactions ct ON ct.account_id = ca.id
         LEFT JOIN attendance a
          ON a.lesson_session_id = ls.id
          AND a.student_id = s.id
         WHERE ls.id = ?
          AND ls.teacher_id = ?
         GROUP BY
          s.id, s.preferred_name, s.legal_name, s.date_of_birth,
          ls.session_date, a.status, a.billing_status
         ORDER BY COALESCE(s.preferred_name, s.legal_name)`,
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
    attendanceStatus: row.attendanceStatus ?? "present",
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
  };
}
