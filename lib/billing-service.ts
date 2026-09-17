import "server-only";

import { getD1 } from "@/db";
import { AppError, type BillingResolutionInput } from "@/lib/domain";
import type { StaffUser } from "@/lib/server-auth";

export type BillingExceptionItem = {
  id: string;
  attendanceId: string;
  studentId: string;
  studentName: string;
  className: string;
  sessionDate: string;
  balance: number;
  status: "open" | "resolved" | "waived" | "cancelled";
  version: number;
  createdAt: string;
};

type BillingExceptionRow = BillingExceptionItem & {
  accountId: string;
  ownerAdminId: string | null;
};

function publicException(row: BillingExceptionRow): BillingExceptionItem {
  return {
    id: row.id,
    attendanceId: row.attendanceId,
    studentId: row.studentId,
    studentName: row.studentName,
    className: row.className,
    sessionDate: row.sessionDate,
    balance: Number(row.balance),
    status: row.status,
    version: Number(row.version),
    createdAt: row.createdAt,
  };
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

function assertBillingAccess(staff: StaffUser, ownerAdminId: string | null) {
  if (staff.role === "manager") return;
  if (staff.role === "admin" && ownerAdminId === staff.id) return;
  throw new AppError(
    403,
    "BILLING_EXCEPTION_ACCESS_DENIED",
    "You cannot manage this billing exception.",
  );
}

export async function listBillingExceptions(
  staff: StaffUser,
): Promise<BillingExceptionItem[]> {
  if (!["admin", "manager"].includes(staff.role)) {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "Only admin and manager roles can view billing exceptions.",
    );
  }
  const result = await getD1()
    .prepare(
      `SELECT
        exception_record.id,
        exception_record.attendance_id AS attendanceId,
        exception_record.student_id AS studentId,
        participant.display_name AS studentName,
        series.name AS className,
        session.session_date AS sessionDate,
        COALESCE(SUM(transaction_record.quantity), 0) AS balance,
        exception_record.status,
        exception_record.version,
        exception_record.created_at AS createdAt
       FROM billing_exceptions AS exception_record
       JOIN attendance ON attendance.id = exception_record.attendance_id
       JOIN lesson_sessions AS session ON session.id = attendance.lesson_session_id
       JOIN class_series AS series ON series.id = session.class_series_id
       JOIN session_participants AS participant
        ON participant.lesson_session_id = session.id
       AND participant.student_id = exception_record.student_id
       JOIN students AS student ON student.id = exception_record.student_id
       LEFT JOIN credit_transactions AS transaction_record
        ON transaction_record.account_id = exception_record.account_id
       WHERE exception_record.status = 'open'
        AND (? = 'manager' OR student.owner_admin_id = ?)
       GROUP BY
        exception_record.id, exception_record.attendance_id,
        exception_record.student_id, participant.display_name,
        series.name, session.session_date, exception_record.status,
        exception_record.version, exception_record.created_at
       ORDER BY exception_record.created_at`,
    )
    .bind(staff.role, staff.id)
    .all<BillingExceptionItem>();
  return result.results.map((item) => ({ ...item, balance: Number(item.balance) }));
}

async function readException(exceptionId: string): Promise<BillingExceptionRow | null> {
  return getD1()
    .prepare(
      `SELECT
        exception_record.id,
        exception_record.attendance_id AS attendanceId,
        exception_record.student_id AS studentId,
        participant.display_name AS studentName,
        series.name AS className,
        session.session_date AS sessionDate,
        exception_record.account_id AS accountId,
        student.owner_admin_id AS ownerAdminId,
        COALESCE(SUM(transaction_record.quantity), 0) AS balance,
        exception_record.status,
        exception_record.version,
        exception_record.created_at AS createdAt
       FROM billing_exceptions AS exception_record
       JOIN attendance ON attendance.id = exception_record.attendance_id
       JOIN lesson_sessions AS session ON session.id = attendance.lesson_session_id
       JOIN class_series AS series ON series.id = session.class_series_id
       JOIN session_participants AS participant
        ON participant.lesson_session_id = session.id
       AND participant.student_id = exception_record.student_id
       JOIN students AS student ON student.id = exception_record.student_id
       LEFT JOIN credit_transactions AS transaction_record
        ON transaction_record.account_id = exception_record.account_id
       WHERE exception_record.id = ?
       GROUP BY exception_record.id
       LIMIT 1`,
    )
    .bind(exceptionId)
    .first<BillingExceptionRow>();
}

export async function resolveBillingException(
  staff: StaffUser,
  exceptionId: string,
  idempotencyKey: string,
  input: BillingResolutionInput,
): Promise<BillingExceptionItem> {
  if (!["admin", "manager"].includes(staff.role)) {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "Only admin and manager roles can resolve billing exceptions.",
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

  const exception = await readException(exceptionId);
  if (!exception) {
    throw new AppError(
      404,
      "BILLING_EXCEPTION_NOT_FOUND",
      "Billing exception not found.",
    );
  }
  assertBillingAccess(staff, exception.ownerAdminId);

  const hash = await sha256(
    JSON.stringify({
      operation: "resolve_billing_exception",
      exceptionId,
      expectedVersion: input.expectedVersion,
      action: input.action,
      note: input.note.normalize("NFC").trim(),
    }),
  );
  const db = getD1();
  const existingClaim = await db
    .prepare(
      `SELECT actor_id AS actorId, idempotency_key AS idempotencyKey,
              request_hash AS requestHash, state
       FROM billing_exception_resolution_claims
       WHERE billing_exception_id = ?
       LIMIT 1`,
    )
    .bind(exceptionId)
    .first<{
      actorId: string;
      idempotencyKey: string;
      requestHash: string;
      state: string;
    }>();

  if (existingClaim) {
    if (
      existingClaim.actorId === staff.id &&
      existingClaim.idempotencyKey === idempotencyKey &&
      existingClaim.requestHash === hash &&
      existingClaim.state === "completed"
    ) {
      const replay = await readException(exceptionId);
      if (!replay) throw new AppError(404, "BILLING_EXCEPTION_NOT_FOUND", "Billing exception not found.");
      return publicException(replay);
    }
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This billing exception was already resolved by another request.",
    );
  }
  if (exception.status !== "open") {
    throw new AppError(
      409,
      "BILLING_EXCEPTION_ALREADY_RESOLVED",
      "This billing exception is no longer open.",
    );
  }
  if (exception.version !== input.expectedVersion) {
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      "This billing exception changed after it was opened.",
    );
  }
  if (input.action === "charge" && exception.balance < 1) {
    throw new AppError(
      409,
      "INSUFFICIENT_CREDITS",
      "The student still has no available lesson credit.",
    );
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO billing_exception_resolution_claims
          (billing_exception_id, actor_id, expected_version,
           idempotency_key, request_hash, action, state)
         VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
      )
      .bind(
        exceptionId,
        staff.id,
        input.expectedVersion,
        idempotencyKey,
        hash,
        input.action,
      ),
  ];

  let transactionId: string | null = null;
  if (input.action === "charge") {
    transactionId = `credit_${exception.attendanceId}`;
    statements.push(
      db
        .prepare(
          `INSERT INTO credit_transactions
            (id, account_id, kind, quantity, source_type,
             source_id, note, created_by_id)
           VALUES (?, ?, 'attendance', -1, 'attendance', ?, ?, ?)`,
        )
        .bind(
          transactionId,
          exception.accountId,
          exception.attendanceId,
          `Resolved after top-up: ${input.note}`,
          staff.id,
        ),
    );
  } else {
    statements.push(
      db
        .prepare(
          `UPDATE attendance
           SET billing_status = 'not_charged'
           WHERE id = ? AND billing_status = 'pending_insufficient_credit'`,
        )
        .bind(exception.attendanceId),
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE billing_exceptions
         SET status = ?, version = version + 1, resolution_note = ?,
             resolution_type = ?, resolution_transaction_id = ?,
             resolved_by_id = ?, resolved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        input.action === "charge" ? "resolved" : "waived",
        input.note,
        input.action === "charge" ? "charged_after_topup" : "waived",
        transactionId,
        staff.id,
        exceptionId,
      ),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_events
          (id, actor_id, action, entity_type, entity_id, metadata_json)
         VALUES (?, ?, ?, 'billing_exception', ?, ?)`,
      )
      .bind(
        `audit_billing_${exceptionId}`,
        staff.id,
        input.action === "charge"
          ? "billing_exception.charged"
          : "billing_exception.waived",
        exceptionId,
        JSON.stringify({ note: input.note, idempotencyKey }),
      ),
  );
  statements.push(
    db
      .prepare(
        `UPDATE billing_exception_resolution_claims
         SET state = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE billing_exception_id = ? AND request_hash = ?`,
      )
      .bind(exceptionId, hash),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("BILLING_EXCEPTION_CLAIM_REJECTED")) {
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        "This billing exception changed while it was being resolved.",
      );
    }
    throw error;
  }

  const resolved = await readException(exceptionId);
  if (!resolved) {
    throw new AppError(500, "BILLING_EXCEPTION_RESULT_MISSING", "The resolution result could not be read.");
  }
  return publicException(resolved);
}
