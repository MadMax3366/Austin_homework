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
import type { CompleteClassResult } from "@/lib/types";

type SessionGuardRow = {
  id: string;
  teacherId: string;
  status: "scheduled" | "completed" | "cancelled";
  version: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionKind: "regular" | "trial" | "makeup" | "private";
  rosterFrozenAt: string | null;
};

type CompletionClaimRow = {
  lessonSessionId?: string;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  state: "processing" | "completed";
};

type RosterAccountRow = {
  studentId: string;
  accountId: string;
  source: "enrollment" | "trial" | "makeup" | "manual";
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

async function completionHash(
  sessionId: string,
  input: CompleteClassInput,
): Promise<string> {
  const canonical = {
    schemaVersion: 1,
    operation: "complete_class",
    sessionId,
    expectedVersion: input.expectedVersion,
    records: [...input.records].sort((a, b) =>
      a.studentId.localeCompare(b.studentId),
    ),
    rawClassNotes: input.rawClassNotes.normalize("NFC").trim(),
    feedback: input.feedback ?? null,
  };
  return sha256(JSON.stringify(canonical));
}

async function readStableResult(
  staff: StaffUser,
  sessionId: string,
  idempotentReplay: boolean,
): Promise<CompleteClassResult> {
  const result = await getD1()
    .prepare(
      `SELECT
        session.id AS sessionId,
        session.status,
        session.version,
        SUM(CASE WHEN attendance.billing_status = 'charged' THEN 1 ELSE 0 END) AS chargedCount,
        SUM(CASE WHEN attendance.status = 'absent' THEN 1 ELSE 0 END) AS absentCount,
        SUM(CASE
          WHEN attendance.billing_status = 'pending_insufficient_credit'
          THEN 1 ELSE 0 END) AS pendingCreditCount
       FROM lesson_sessions AS session
       LEFT JOIN attendance
        ON attendance.lesson_session_id = session.id
       WHERE session.id = ?
        AND session.teacher_id = ?
       GROUP BY session.id, session.status, session.version
       LIMIT 1`,
    )
    .bind(sessionId, staff.id)
    .first<{
      sessionId: string;
      status: string;
      version: number;
      chargedCount: number;
      absentCount: number;
      pendingCreditCount: number;
    }>();

  if (!result) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Class session not found.");
  }
  if (result.status !== "completed") {
    throw new AppError(
      409,
      "SESSION_NOT_COMPLETED",
      "The class completion result is not available yet.",
    );
  }

  return {
    sessionId: result.sessionId,
    status: "completed",
    version: Number(result.version),
    chargedCount: Number(result.chargedCount ?? 0),
    absentCount: Number(result.absentCount ?? 0),
    pendingCreditCount: Number(result.pendingCreditCount ?? 0),
    idempotentReplay,
  };
}

function databaseMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const hash = await completionHash(sessionId, input);
  const session = await db
    .prepare(
      `SELECT
        id,
        teacher_id AS teacherId,
        status,
        version,
        session_date AS sessionDate,
        local_start_time AS startTime,
        local_end_time AS endTime,
        session_kind AS sessionKind,
        roster_frozen_at AS rosterFrozenAt
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

  const priorKeyClaim = await db
    .prepare(
      `SELECT lesson_session_id AS lessonSessionId,
              actor_id AS actorId,idempotency_key AS idempotencyKey,
              request_hash AS requestHash,state
       FROM session_completion_claims
       WHERE actor_id=? AND operation='complete_class' AND idempotency_key=?
       LIMIT 1`,
    )
    .bind(staff.id, idempotencyKey)
    .first<CompletionClaimRow>();
  if (priorKeyClaim && priorKeyClaim.lessonSessionId !== sessionId) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for another class session.",
    );
  }

  const existingClaim = await db
    .prepare(
      `SELECT
        actor_id AS actorId,
        idempotency_key AS idempotencyKey,
        request_hash AS requestHash,
        state
       FROM session_completion_claims
       WHERE lesson_session_id = ?
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<CompletionClaimRow>();

  if (existingClaim) {
    if (
      existingClaim.actorId === staff.id &&
      existingClaim.idempotencyKey === idempotencyKey &&
      existingClaim.requestHash === hash &&
      existingClaim.state === "completed"
    ) {
      return readStableResult(staff, sessionId, true);
    }
    if (
      existingClaim.actorId === staff.id &&
      existingClaim.idempotencyKey === idempotencyKey
    ) {
      throw new AppError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used with different attendance.",
      );
    }
    throw new AppError(
      409,
      "SESSION_ALREADY_COMPLETED",
      "This class has already been claimed or completed.",
    );
  }

  if (session.status === "completed") {
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
  if (!session.rosterFrozenAt) {
    throw new AppError(
      409,
      "ROSTER_NOT_READY",
      "The class roster has not been frozen for attendance.",
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
        participant.student_id AS studentId,
        participant.credit_account_id AS accountId,
        participant.source
       FROM session_participants AS participant
       WHERE participant.lesson_session_id = ?
        AND participant.removed_at IS NULL
       ORDER BY participant.sort_order, participant.student_id`,
    )
    .bind(sessionId)
    .all<RosterAccountRow>();

  const roster = rosterResult.results;
  if (roster.length === 0) {
    throw new AppError(
      409,
      "EMPTY_ROSTER",
      "A class with no participants must be cancelled rather than completed.",
    );
  }

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
      "Attendance must include every current participant exactly once.",
      { missing, unexpected },
    );
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO session_completion_claims
          (lesson_session_id, actor_id, expected_version, operation,
           idempotency_key, request_hash, state)
         VALUES (?, ?, ?, 'complete_class', ?, ?, 'processing')`,
      )
      .bind(
        sessionId,
        staff.id,
        input.expectedVersion,
        idempotencyKey,
        hash,
      ),
  ];

  for (const row of roster) {
    const record = submitted.get(row.studentId);
    if (!record) continue;
    const attendanceId = `attendance_${sessionId}_${row.studentId}`;
    const billable =
      row.source !== "trial" &&
      session.sessionKind !== "trial" &&
      isBillable(record.status);

    statements.push(
      db
        .prepare(
          `INSERT INTO attendance
            (id, lesson_session_id, student_id, status,
             billing_status, recorded_by_id)
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
              (id, account_id, kind, quantity, source_type,
               source_id, note, created_by_id)
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
      statements.push(
        db
          .prepare(
            `INSERT INTO billing_exceptions
              (id, attendance_id, student_id, account_id, reason,
               status, assigned_to_id)
             SELECT ?, ?, ?, ?, 'insufficient_credit', 'open',
               (SELECT owner_admin_id FROM students WHERE id = ?)
             WHERE NOT EXISTS (
               SELECT 1
               FROM credit_transactions
               WHERE kind = 'attendance'
                AND source_type = 'attendance'
                AND source_id = ?
             )`,
          )
          .bind(
            `billing_exception_${attendanceId}`,
            attendanceId,
            row.studentId,
            row.accountId,
            row.studentId,
            attendanceId,
          ),
      );
    }
  }

  const [payRate, payrollPeriod, organization] = await Promise.all([
    db.prepare(
      `SELECT amount_cents AS amountCents
       FROM teacher_pay_rates
       WHERE teacher_id=? AND session_kind=? AND starts_on<=?
         AND (ends_on IS NULL OR ends_on>=?)
       ORDER BY starts_on DESC LIMIT 1`,
    ).bind(staff.id, session.sessionKind, session.sessionDate, session.sessionDate)
      .first<{ amountCents: number }>(),
    db.prepare(
      `SELECT id FROM payroll_periods
       WHERE starts_on<=? AND ends_on>=? AND status='open'
       ORDER BY starts_on DESC LIMIT 1`,
    ).bind(session.sessionDate, session.sessionDate).first<{ id: string }>(),
    db.prepare(
      `SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1`,
    ).first<{ id: string }>(),
  ]);

  const [startHour, startMinute] = session.startTime.split(":").map(Number);
  const [endHour, endMinute] = session.endTime.split(":").map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  statements.push(
    db.prepare(
      `INSERT INTO payroll_entries
        (id,payroll_period_id,lesson_session_id,teacher_id,session_kind,minutes,
         base_amount_cents,status,note)
       VALUES (?,?,?,?,?,?,?,'accrued',?)`,
    ).bind(
      `payroll_${sessionId}`,
      payrollPeriod?.id ?? null,
      sessionId,
      staff.id,
      session.sessionKind,
      minutes,
      Number(payRate?.amountCents ?? 0),
      payRate ? null : "Pay rate missing; manager review required",
    ),
  );
  if (organization) {
    statements.push(
      db.prepare(
        `INSERT INTO outbox_events
          (id,organization_id,event_type,aggregate_type,aggregate_id,dedupe_key,payload_json)
         VALUES (?,?,'class.completed','lesson_session',?,?,?)`,
      ).bind(
        `outbox_class_${sessionId}`,
        organization.id,
        sessionId,
        `class.completed:${sessionId}`,
        JSON.stringify({ sessionId, teacherId: staff.id }),
      ),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE lesson_sessions
         SET status = 'completed',
             raw_class_notes = ?,
             feedback_json = ?,
             completed_at = CURRENT_TIMESTAMP,
             completed_by_id = ?,
             version = version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND teacher_id = ?`,
      )
      .bind(
        input.rawClassNotes || null,
        input.feedback ? JSON.stringify(input.feedback) : null,
        staff.id,
        sessionId,
        staff.id,
      ),
  );
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
        `UPDATE session_completion_claims
         SET state = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE lesson_session_id = ?
          AND actor_id = ?
          AND request_hash = ?`,
      )
      .bind(sessionId, staff.id, hash),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    const racedClaim = await db
      .prepare(
        `SELECT actor_id AS actorId, idempotency_key AS idempotencyKey,
                request_hash AS requestHash, state
         FROM session_completion_claims
         WHERE lesson_session_id = ?
         LIMIT 1`,
      )
      .bind(sessionId)
      .first<CompletionClaimRow>();

    if (
      racedClaim?.actorId === staff.id &&
      racedClaim.idempotencyKey === idempotencyKey &&
      racedClaim.requestHash === hash &&
      racedClaim.state === "completed"
    ) {
      return readStableResult(staff, sessionId, true);
    }

    const racedKey = await db
      .prepare(
        `SELECT lesson_session_id AS lessonSessionId
         FROM session_completion_claims
         WHERE actor_id=? AND operation='complete_class' AND idempotency_key=?
         LIMIT 1`,
      )
      .bind(staff.id, idempotencyKey)
      .first<{ lessonSessionId: string }>();
    if (racedKey && racedKey.lessonSessionId !== sessionId) {
      throw new AppError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used for another class session.",
      );
    }

    const message = databaseMessage(error);
    if (message.includes("SESSION_COMPLETION_CLAIM_REJECTED")) {
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        "This class changed while it was being completed. Refresh and compare.",
      );
    }
    if (
      message.includes("STUDENT_NOT_IN_SESSION_ROSTER") ||
      message.includes("UNIQUE constraint failed: attendance")
    ) {
      throw new AppError(
        409,
        "SESSION_COMPLETION_CONFLICT",
        "Attendance changed while the class was being completed.",
      );
    }
    throw error;
  }

  const result = await readStableResult(staff, sessionId, false);
  try {
    await db
      .prepare(
        `UPDATE session_completion_claims
         SET response_json = ?
         WHERE lesson_session_id = ? AND response_json IS NULL`,
      )
      .bind(JSON.stringify(result), sessionId)
      .run();
  } catch (error) {
    console.error("Completion receipt snapshot could not be cached", error);
  }
  return result;
}
