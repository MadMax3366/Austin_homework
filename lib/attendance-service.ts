import "server-only";

import { getD1 } from "@/db";
import {
  AppError,
  type CompleteClassInput,
  isBillable,
  melbourneDate,
  melbourneTime,
} from "@/lib/domain";
import type { StaffUser } from "@/lib/server-auth";
import type {
  CompleteClassResult,
  TeacherWorkspaceData,
} from "@/lib/types";
import { loadTeacherWorkspace } from "@/lib/workspace-data";

type SessionGuardRow = {
  id: string;
  teacherId: string;
  status: "scheduled" | "completed" | "cancelled";
  version: number;
  sessionDate: string;
  startTime: string;
  completionKey: string | null;
  completionHash: string | null;
};

type RosterAccountRow = {
  studentId: string;
  accountId: string;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function completionHash(input: CompleteClassInput): Promise<string> {
  const canonical = {
    expectedVersion: input.expectedVersion,
    records: [...input.records].sort((a, b) =>
      a.studentId.localeCompare(b.studentId),
    ),
    rawClassNotes: input.rawClassNotes,
    feedback: input.feedback ?? null,
  };
  return sha256(JSON.stringify(canonical));
}

function completionResult(
  workspace: TeacherWorkspaceData,
  idempotentReplay: boolean,
): CompleteClassResult {
  if (!workspace.selectedSession) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Class session not found.");
  }

  return {
    sessionId: workspace.selectedSession.id,
    status: "completed",
    version: workspace.selectedSession.version,
    chargedCount: workspace.roster.filter(
      (student) => student.billingStatus === "charged",
    ).length,
    absentCount: workspace.roster.filter(
      (student) => student.attendanceStatus === "absent",
    ).length,
    pendingCreditCount: workspace.roster.filter(
      (student) =>
        student.billingStatus === "pending_insufficient_credit",
    ).length,
    roster: workspace.roster,
    idempotentReplay,
  };
}

export async function completeClass(
  staff: StaffUser,
  sessionId: string,
  idempotencyKey: string,
  input: CompleteClassInput,
  now = new Date(),
): Promise<CompleteClassResult> {
  if (staff.role !== "teacher") {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "Only teachers can complete a class.",
    );
  }

  if (
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 100 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required.",
    );
  }

  const db = getD1();
  const hash = await completionHash(input);
  const session = await db
    .prepare(
      `SELECT
        id,
        teacher_id AS teacherId,
        status,
        version,
        session_date AS sessionDate,
        local_start_time AS startTime,
        completion_key AS completionKey,
        completion_hash AS completionHash
       FROM lesson_sessions
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<SessionGuardRow>();

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

  if (session.status === "completed") {
    if (
      session.completionKey === idempotencyKey &&
      session.completionHash === hash
    ) {
      return completionResult(
        await loadTeacherWorkspace(staff, sessionId, now),
        true,
      );
    }
    if (session.completionKey === idempotencyKey) {
      throw new AppError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used with different attendance.",
      );
    }
    throw new AppError(
      409,
      "SESSION_ALREADY_COMPLETED",
      "This class has already been completed.",
    );
  }
  if (session.status === "cancelled") {
    throw new AppError(
      409,
      "SESSION_CANCELLED",
      "A cancelled class cannot be completed.",
    );
  }
  if (session.version !== input.expectedVersion) {
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      "This class changed after you opened it. Refresh and try again.",
      { expected: input.expectedVersion, actual: session.version },
    );
  }

  const today = melbourneDate(now);
  const currentTime = melbourneTime(now);
  if (
    session.sessionDate > today ||
    (session.sessionDate === today && session.startTime > currentTime)
  ) {
    throw new AppError(
      409,
      "SESSION_NOT_STARTED",
      "Attendance cannot be finalised before the class starts.",
    );
  }
  if (session.sessionDate < today) {
    throw new AppError(
      409,
      "ATTENDANCE_WINDOW_CLOSED",
      "Past attendance must be corrected by an admin.",
    );
  }

  const rosterResult = await db
    .prepare(
      `SELECT
        e.student_id AS studentId,
        ca.id AS accountId
       FROM lesson_sessions ls
       JOIN enrollments e
        ON e.class_series_id = ls.class_series_id
        AND e.status = 'active'
        AND e.starts_on <= ls.session_date
        AND (e.ends_on IS NULL OR e.ends_on >= ls.session_date)
       JOIN credit_accounts ca ON ca.student_id = e.student_id
       WHERE ls.id = ?
       ORDER BY e.student_id`,
    )
    .bind(sessionId)
    .all<RosterAccountRow>();

  const roster = rosterResult.results;
  const submitted = new Map(
    input.records.map((record) => [record.studentId, record]),
  );
  const rosterIds = new Set(roster.map((row) => row.studentId));
  const missing = roster
    .filter((row) => !submitted.has(row.studentId))
    .map((row) => row.studentId);
  const unexpected = input.records
    .filter((record) => !rosterIds.has(record.studentId))
    .map((record) => record.studentId);

  if (missing.length || unexpected.length) {
    throw new AppError(
      422,
      unexpected.length ? "STUDENT_NOT_IN_ROSTER" : "INCOMPLETE_ROSTER",
      "Attendance must include every current student exactly once.",
      { missing, unexpected },
    );
  }

  const statements: D1PreparedStatement[] = [];
  for (const row of roster) {
    const record = submitted.get(row.studentId);
    if (!record) continue;

    const attendanceId = `attendance_${sessionId}_${row.studentId}`;
    const billable = isBillable(record.status);
    statements.push(
      db
        .prepare(
          `INSERT INTO attendance
            (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          attendanceId,
          sessionId,
          row.studentId,
          record.status,
          billable ? "pending_insufficient_credit" : "not_charged",
          staff.id,
        ),
    );

    if (billable) {
      statements.push(
        db
          .prepare(
            `INSERT INTO credit_transactions
              (id, account_id, kind, quantity, source_type, source_id, note, created_by_id)
             SELECT ?, ?, 'attendance', -1, 'attendance', ?, ?, ?
             WHERE (
               SELECT COALESCE(SUM(quantity), 0)
               FROM credit_transactions
               WHERE account_id = ?
             ) >= 1`,
          )
          .bind(
            `credit_${attendanceId}`,
            row.accountId,
            attendanceId,
            `Lesson credit for ${sessionId}`,
            staff.id,
            row.accountId,
          ),
      );
    }
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO audit_events
          (id, actor_id, action, entity_type, entity_id, metadata_json)
         VALUES (?, ?, 'class.completed', 'lesson_session', ?, ?)`,
      )
      .bind(
        `audit_complete_${sessionId}`,
        staff.id,
        sessionId,
        JSON.stringify({
          idempotencyKey,
          attendanceCount: input.records.length,
        }),
      ),
  );
  statements.push(
    db
      .prepare(
        `UPDATE lesson_sessions
         SET
          status = 'completed',
          raw_class_notes = ?,
          feedback_json = ?,
          completion_key = ?,
          completion_hash = ?,
          completed_at = CURRENT_TIMESTAMP,
          completed_by_id = ?,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
          AND teacher_id = ?
          AND status = 'scheduled'
          AND version = ?`,
      )
      .bind(
        input.rawClassNotes || null,
        input.feedback ? JSON.stringify(input.feedback) : null,
        idempotencyKey,
        hash,
        staff.id,
        sessionId,
        staff.id,
        input.expectedVersion,
      ),
  );

  try {
    const results = await db.batch(statements);
    const update = results.at(-1);
    if (!update?.meta || Number(update.meta.changes) !== 1) {
      throw new Error("SESSION_FINALIZE_GUARD_FAILED");
    }
  } catch (error) {
    const latest = await db
      .prepare(
        `SELECT status, completion_key AS completionKey, completion_hash AS completionHash
         FROM lesson_sessions WHERE id = ? LIMIT 1`,
      )
      .bind(sessionId)
      .first<{
        status: string;
        completionKey: string | null;
        completionHash: string | null;
      }>();

    if (
      latest?.status === "completed" &&
      latest.completionKey === idempotencyKey &&
      latest.completionHash === hash
    ) {
      return completionResult(
        await loadTeacherWorkspace(staff, sessionId, now),
        true,
      );
    }

    console.error("Class completion failed", error);
    throw new AppError(
      409,
      "SESSION_COMPLETION_CONFLICT",
      "The class could not be completed because its data changed. Refresh and try again.",
    );
  }

  return completionResult(
    await loadTeacherWorkspace(staff, sessionId, now),
    false,
  );
}
