import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const projectRoot = process.cwd();

function createDatabase(options: { balance?: number; freeze?: boolean } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(join(projectRoot, "drizzle"))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    db.exec(readFileSync(join(projectRoot, "drizzle", file), "utf8"));
  }

  db.exec(`
    INSERT INTO staff_users
      (id, auth_user_id, email, display_name, role, active)
    VALUES
      ('teacher_1', 'auth_teacher_1', 'teacher@example.test', 'Teacher One', 'teacher', 1),
      ('admin_1', 'auth_admin_1', 'admin@example.test', 'Admin One', 'admin', 1);
    INSERT INTO students
      (id, legal_name, preferred_name, date_of_birth, lifecycle_status, owner_admin_id)
    VALUES ('student_1', 'Student One', 'Student', '2014-01-01', 'active', 'admin_1');
    INSERT INTO credit_accounts (id, student_id) VALUES ('account_1', 'student_1');
    INSERT INTO class_series
      (id, name, subject, room, weekday, local_start_time, local_end_time,
       default_teacher_id, capacity, active)
    VALUES ('series_1', 'Math', 'Mathematics', 'Room 1', 1, '10:00', '11:00',
            'teacher_1', 10, 1);
    INSERT INTO lesson_sessions
      (id, class_series_id, teacher_id, session_date, local_start_time,
       local_end_time, status)
    VALUES ('session_1', 'series_1', 'teacher_1', '2026-09-17',
            '10:00', '11:00', 'scheduled');
    INSERT INTO enrollments
      (id, student_id, class_series_id, starts_on, status)
    VALUES ('enrollment_1', 'student_1', 'series_1', '2026-01-01', 'active');
    INSERT INTO session_participants
      (id, lesson_session_id, student_id, enrollment_id, credit_account_id,
       display_name, date_of_birth, is_new, source, sort_order)
    VALUES ('participant_1', 'session_1', 'student_1', 'enrollment_1',
            'account_1', 'Student', '2014-01-01', 1, 'enrollment', 1);
  `);
  if ((options.balance ?? 1) > 0) {
    db.prepare(`
      INSERT INTO credit_transactions
        (id, account_id, kind, quantity, source_type, source_id, note, created_by_id)
      VALUES ('opening_1', 'account_1', 'purchase', ?, 'seed', 'opening',
              'Opening balance', 'admin_1')
    `).run(options.balance ?? 1);
  }
  if (options.freeze !== false) {
    db.exec(
      "UPDATE lesson_sessions SET roster_frozen_at=CURRENT_TIMESTAMP WHERE id='session_1'",
    );
  }
  return db;
}

test("all migrations apply to a clean SQLite database", () => {
  const db = createDatabase();
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as Array<{ name: string }>;
  assert.ok(tables.some((row) => row.name === "session_participants"));
  assert.ok(tables.some((row) => row.name === "billing_exceptions"));
  assert.ok(tables.some((row) => row.name === "session_completion_claims"));
});

test("a frozen participant snapshot cannot be edited or deleted", () => {
  const db = createDatabase();
  assert.throws(
    () =>
      db.exec(
        "UPDATE session_participants SET display_name='Changed' WHERE id='participant_1'",
      ),
    /SESSION_ROSTER_IS_FROZEN/,
  );
  assert.throws(
    () => db.exec("DELETE FROM session_participants WHERE id='participant_1'"),
    /SESSION_ROSTER_IS_FROZEN/,
  );
});

test("completion claim rejects stale versions before attendance writes", () => {
  const db = createDatabase();
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO session_completion_claims
          (lesson_session_id, actor_id, expected_version, idempotency_key,
           request_hash, state)
        VALUES ('session_1', 'teacher_1', 2, 'stale-key', 'hash', 'processing')
      `),
    /SESSION_COMPLETION_CLAIM_REJECTED/,
  );
  const count = db.prepare("SELECT COUNT(*) AS count FROM attendance").get() as {
    count: number;
  };
  assert.equal(count.count, 0);
});

test("a later statement failure rolls back the claim and attendance", () => {
  const db = createDatabase();
  db.exec("BEGIN");
  try {
    db.exec(`
      INSERT INTO session_completion_claims
        (lesson_session_id, actor_id, expected_version, idempotency_key,
         request_hash, state)
      VALUES ('session_1', 'teacher_1', 1, 'rollback-key', 'hash', 'processing');
      INSERT INTO attendance
        (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
      VALUES ('attendance_1', 'session_1', 'student_1', 'present',
              'pending_insufficient_credit', 'teacher_1')
    `);
    assert.throws(
      () =>
        db.exec(`
          INSERT INTO attendance
            (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
          VALUES ('attendance_2', 'session_1', 'student_1', 'present',
                  'pending_insufficient_credit', 'teacher_1')
        `),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.exec("ROLLBACK");
  }
  const claims = db
    .prepare("SELECT COUNT(*) AS count FROM session_completion_claims")
    .get() as { count: number };
  const attendance = db
    .prepare("SELECT COUNT(*) AS count FROM attendance")
    .get() as { count: number };
  assert.equal(claims.count, 0);
  assert.equal(attendance.count, 0);
});

test("database rejects another teacher and a non-participant attendance", () => {
  const db = createDatabase();
  db.exec(`
    INSERT INTO staff_users
      (id, auth_user_id, email, display_name, role, active)
    VALUES ('teacher_2', 'auth_teacher_2', 'teacher2@example.test',
            'Teacher Two', 'teacher', 1)
  `);
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO attendance
          (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
        VALUES ('bad_actor', 'session_1', 'student_1', 'present',
                'pending_insufficient_credit', 'teacher_2')
      `),
    /ATTENDANCE_SESSION_NOT_WRITABLE/,
  );
  db.exec(`
    INSERT INTO students
      (id, legal_name, date_of_birth, lifecycle_status, owner_admin_id)
    VALUES ('student_2', 'Student Two', '2014-02-01', 'active', 'admin_1')
  `);
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO attendance
          (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
        VALUES ('bad_roster', 'session_1', 'student_2', 'present',
                'pending_insufficient_credit', 'teacher_1')
      `),
    /STUDENT_NOT_IN_SESSION_ROSTER/,
  );
});

test("zero balance records attendance and one valid billing exception", () => {
  const db = createDatabase({ balance: 0 });
  db.exec(`
    INSERT INTO attendance
      (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
    VALUES ('attendance_1', 'session_1', 'student_1', 'present',
            'pending_insufficient_credit', 'teacher_1');
    INSERT INTO billing_exceptions
      (id, attendance_id, student_id, account_id, reason, status, assigned_to_id)
    VALUES ('exception_1', 'attendance_1', 'student_1', 'account_1',
            'insufficient_credit', 'open', 'admin_1');
  `);
  const result = db
    .prepare(
      "SELECT COUNT(*) AS count FROM billing_exceptions WHERE status='open'",
    )
    .get() as { count: number };
  assert.equal(result.count, 1);
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO billing_exceptions
          (id, attendance_id, student_id, account_id, reason, status)
        VALUES ('exception_2', 'attendance_1', 'student_1', 'account_1',
                'insufficient_credit', 'open')
      `),
    /UNIQUE constraint failed/,
  );
});

test("billing exception claim enforces owner role and expected version", () => {
  const db = createDatabase({ balance: 0 });
  db.exec(`
    INSERT INTO attendance
      (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
    VALUES ('attendance_1', 'session_1', 'student_1', 'present',
            'pending_insufficient_credit', 'teacher_1');
    INSERT INTO billing_exceptions
      (id, attendance_id, student_id, account_id, reason, status, assigned_to_id)
    VALUES ('exception_1', 'attendance_1', 'student_1', 'account_1',
            'insufficient_credit', 'open', 'admin_1');
  `);
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO billing_exception_resolution_claims
          (billing_exception_id, actor_id, expected_version, idempotency_key,
           request_hash, action, state)
        VALUES ('exception_1', 'teacher_1', 1, 'teacher-key', 'hash',
                'waive', 'processing')
      `),
    /BILLING_EXCEPTION_CLAIM_REJECTED/,
  );
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO billing_exception_resolution_claims
          (billing_exception_id, actor_id, expected_version, idempotency_key,
           request_hash, action, state)
        VALUES ('exception_1', 'admin_1', 2, 'stale-admin-key', 'hash',
                'waive', 'processing')
      `),
    /BILLING_EXCEPTION_CLAIM_REJECTED/,
  );
  db.exec(`
    INSERT INTO billing_exception_resolution_claims
      (billing_exception_id, actor_id, expected_version, idempotency_key,
       request_hash, action, state)
    VALUES ('exception_1', 'admin_1', 1, 'valid-admin-key', 'hash',
            'waive', 'processing')
  `);
  const count = db
    .prepare(
      "SELECT COUNT(*) AS count FROM billing_exception_resolution_claims",
    )
    .get() as { count: number };
  assert.equal(count.count, 1);
});

test("attendance debit cannot overdraw an account", () => {
  const db = createDatabase({ balance: 0 });
  db.exec(`
    INSERT INTO attendance
      (id, lesson_session_id, student_id, status, billing_status, recorded_by_id)
    VALUES ('attendance_1', 'session_1', 'student_1', 'present',
            'pending_insufficient_credit', 'teacher_1')
  `);
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO credit_transactions
          (id, account_id, kind, quantity, source_type, source_id, created_by_id)
        VALUES ('debit_1', 'account_1', 'attendance', -1,
                'attendance', 'attendance_1', 'teacher_1')
      `),
    /INSUFFICIENT_CREDIT/,
  );
});

test("credit ledger rows are immutable", () => {
  const db = createDatabase();
  assert.throws(
    () =>
      db.exec(
        "UPDATE credit_transactions SET quantity=2 WHERE id='opening_1'",
      ),
    /CREDIT_LEDGER_IS_IMMUTABLE/,
  );
  assert.throws(
    () => db.exec("DELETE FROM credit_transactions WHERE id='opening_1'"),
    /CREDIT_LEDGER_IS_IMMUTABLE/,
  );
});

test("only one active enrollment is allowed for a student and class", () => {
  const db = createDatabase();
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO enrollments
          (id, student_id, class_series_id, starts_on, status)
        VALUES ('enrollment_2', 'student_1', 'series_1', '2026-10-01', 'active')
      `),
    /UNIQUE constraint failed/,
  );
});
