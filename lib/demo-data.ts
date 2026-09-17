import { getD1 } from "@/db";
import {
  melbourneDate,
  melbourneTime,
  minutesToTime,
  timeToMinutes,
} from "@/lib/domain";

type LessonWindow = { start: string; end: string };

function lessonWindow(startMinutes: number): LessonWindow {
  const start = Math.max(0, Math.min(24 * 60 - 61, startMinutes));
  return { start: minutesToTime(start), end: minutesToTime(start + 60) };
}

function demoLessonWindows(now = new Date()) {
  const current = timeToMinutes(melbourneTime(now));
  const activeStart = Math.max(0, Math.min(24 * 60 - 61, current - 30));
  const alternatives = [-120, 120, -240, 240]
    .map((offset) => activeStart + offset)
    .filter((value) => value >= 0 && value <= 24 * 60 - 61);

  return {
    active: lessonWindow(activeStart),
    secondary: lessonWindow(alternatives[0] ?? Math.max(0, activeStart - 90)),
    tertiary: lessonWindow(alternatives[1] ?? Math.min(24 * 60 - 61, activeStart + 90)),
  };
}

export async function ensureDemoData(now = new Date()): Promise<void> {
  const db = getD1();
  const today = melbourneDate(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const windows = demoLessonWindows(now);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO staff_users
          (id, auth_user_id, email, display_name, role, active)
         VALUES (?, ?, ?, ?, 'teacher', 1)`,
      )
      .bind("staff_teacher_mei", "local_seedy", "seedy@sites.test", "Mei Lin"),
    db
      .prepare(
        `INSERT OR IGNORE INTO staff_users
          (id, auth_user_id, email, display_name, role, active)
         VALUES (?, ?, ?, ?, 'teacher', 1)`,
      )
      .bind("staff_teacher_arjun", "demo_teacher_arjun", "arjun@example.test", "Arjun Patel"),
    db
      .prepare(
        `INSERT OR IGNORE INTO staff_users
          (id, auth_user_id, email, display_name, role, active)
         VALUES (?, ?, ?, ?, 'admin', 1)`,
      )
      .bind("staff_admin_sofia", "demo_admin_sofia", "sofia@example.test", "Sofia Nguyen"),
    db.prepare(
      `INSERT OR IGNORE INTO students
        (id, legal_name, preferred_name, date_of_birth, lifecycle_status, owner_admin_id)
       VALUES
        ('student_01', 'Olivia Chen', 'Olivia', '2014-02-18', 'active', 'staff_admin_sofia'),
        ('student_02', 'Ethan Wang', 'Ethan', '2013-11-03', 'active', 'staff_admin_sofia'),
        ('student_03', 'Sophie Liu', 'Sophie', '2014-05-27', 'active', 'staff_admin_sofia'),
        ('student_04', 'Noah Zhang', 'Noah', '2013-08-16', 'active', 'staff_admin_sofia'),
        ('student_05', 'Mia Li', 'Mia', '2014-01-09', 'active', 'staff_admin_sofia')`,
    ),
    db.prepare(
      `WITH RECURSIVE seq(n) AS (
         SELECT 6
         UNION ALL
         SELECT n + 1 FROM seq WHERE n < 30
       )
       INSERT OR IGNORE INTO students
         (id, legal_name, preferred_name, date_of_birth, lifecycle_status, owner_admin_id)
       SELECT
         printf('student_%02d', n),
         printf('Demo Student %02d', n),
         printf('Student %02d', n),
         printf('%04d-%02d-%02d', 2012 + (n % 3), 1 + (n % 12), 1 + (n % 27)),
         'active',
         'staff_admin_sofia'
       FROM seq`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO guardians (id, full_name, email, phone)
       VALUES
        ('guardian_01', 'Grace Chen', 'grace@example.test', '0400 000 001'),
        ('guardian_02', 'Daniel Wang', 'daniel@example.test', '0400 000 002'),
        ('guardian_03', 'Jenny Li', 'jenny@example.test', '0400 000 003')`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO student_guardians
        (student_id, guardian_id, relationship, is_primary)
       VALUES
        ('student_01', 'guardian_01', 'mother', 1),
        ('student_02', 'guardian_02', 'father', 1),
        ('student_05', 'guardian_03', 'mother', 1)`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO credit_accounts (id, student_id)
       SELECT 'credits_' || id, id FROM students`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO credit_transactions
        (id, account_id, kind, quantity, source_type, source_id, note, created_by_id)
       SELECT
        'credit_opening_' || s.id,
        'credits_' || s.id,
        'purchase',
        CASE s.id
          WHEN 'student_01' THEN 8
          WHEN 'student_02' THEN 3
          WHEN 'student_03' THEN 14
          WHEN 'student_04' THEN 6
          WHEN 'student_05' THEN 1
          ELSE 10
        END,
        'seed',
        'opening_balance',
        'Synthetic opening balance',
        'staff_admin_sofia'
       FROM students s`,
    ),
    db
      .prepare(
        `INSERT INTO class_series
          (id, name, subject, room, weekday, local_start_time, local_end_time, default_teacher_id, capacity, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
          weekday = excluded.weekday,
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time`,
      )
      .bind(
        "series_y6_math",
        "Year 6 Mathematics",
        "Mathematics",
        "Room 4",
        weekday,
        windows.active.start,
        windows.active.end,
        "staff_teacher_mei",
        10,
      ),
    db
      .prepare(
        `INSERT INTO class_series
          (id, name, subject, room, weekday, local_start_time, local_end_time, default_teacher_id, capacity, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
          weekday = excluded.weekday,
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time`,
      )
      .bind(
        "series_y5_english",
        "Year 5 English",
        "English",
        "Room 2",
        weekday,
        windows.secondary.start,
        windows.secondary.end,
        "staff_teacher_mei",
        12,
      ),
    db
      .prepare(
        `INSERT INTO class_series
          (id, name, subject, room, weekday, local_start_time, local_end_time, default_teacher_id, capacity, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
          weekday = excluded.weekday,
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time`,
      )
      .bind(
        "series_y8_science",
        "Year 8 Science",
        "Science",
        "Lab 1",
        weekday,
        windows.tertiary.start,
        windows.tertiary.end,
        "staff_teacher_mei",
        12,
      ),
    db
      .prepare(
        `INSERT INTO class_series
          (id, name, subject, room, weekday, local_start_time, local_end_time, default_teacher_id, capacity, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
          weekday = excluded.weekday,
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time`,
      )
      .bind(
        "series_other_teacher",
        "Year 7 Writing",
        "English",
        "Room 3",
        weekday,
        windows.active.start,
        windows.active.end,
        "staff_teacher_arjun",
        10,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO lesson_sessions
          (id, class_series_id, teacher_id, session_date, local_start_time, local_end_time, status)
         VALUES (?, 'series_y6_math', 'staff_teacher_mei', ?, ?, ?, 'scheduled')
         ON CONFLICT(id) DO UPDATE SET
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time
         WHERE lesson_sessions.status = 'scheduled'`,
      )
      .bind(`session_y6_math_${today}`, today, windows.active.start, windows.active.end),
    db
      .prepare(
        `INSERT OR IGNORE INTO lesson_sessions
          (id, class_series_id, teacher_id, session_date, local_start_time, local_end_time, status)
         VALUES (?, 'series_y5_english', 'staff_teacher_mei', ?, ?, ?, 'scheduled')
         ON CONFLICT(id) DO UPDATE SET
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time
         WHERE lesson_sessions.status = 'scheduled'`,
      )
      .bind(
        `session_y5_english_${today}`,
        today,
        windows.secondary.start,
        windows.secondary.end,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO lesson_sessions
          (id, class_series_id, teacher_id, session_date, local_start_time, local_end_time, status)
         VALUES (?, 'series_y8_science', 'staff_teacher_mei', ?, ?, ?, 'scheduled')
         ON CONFLICT(id) DO UPDATE SET
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time
         WHERE lesson_sessions.status = 'scheduled'`,
      )
      .bind(
        `session_y8_science_${today}`,
        today,
        windows.tertiary.start,
        windows.tertiary.end,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO lesson_sessions
          (id, class_series_id, teacher_id, session_date, local_start_time, local_end_time, status)
         VALUES (?, 'series_other_teacher', 'staff_teacher_arjun', ?, ?, ?, 'scheduled')
         ON CONFLICT(id) DO UPDATE SET
          local_start_time = excluded.local_start_time,
          local_end_time = excluded.local_end_time
         WHERE lesson_sessions.status = 'scheduled'`,
      )
      .bind(
        `session_other_teacher_${today}`,
        today,
        windows.active.start,
        windows.active.end,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO enrollments
          (id, student_id, class_series_id, starts_on, status)
         VALUES
          ('enrol_math_01', 'student_01', 'series_y6_math', ?, 'active'),
          ('enrol_math_02', 'student_02', 'series_y6_math', '2026-01-01', 'active'),
          ('enrol_math_03', 'student_03', 'series_y6_math', '2026-01-01', 'active'),
          ('enrol_math_04', 'student_04', 'series_y6_math', '2026-01-01', 'active'),
          ('enrol_math_05', 'student_05', 'series_y6_math', '2026-01-01', 'active')`,
      )
      .bind(today),
    db.prepare(
      `WITH RECURSIVE seq(n) AS (
         SELECT 6
         UNION ALL
         SELECT n + 1 FROM seq WHERE n < 12
       )
       INSERT OR IGNORE INTO enrollments
         (id, student_id, class_series_id, starts_on, status)
       SELECT
        printf('enrol_english_%02d', n),
        printf('student_%02d', n),
        'series_y5_english',
        '2026-01-01',
        'active'
       FROM seq`,
    ),
    db.prepare(
      `WITH RECURSIVE seq(n) AS (
         SELECT 13
         UNION ALL
         SELECT n + 1 FROM seq WHERE n < 20
       )
       INSERT OR IGNORE INTO enrollments
         (id, student_id, class_series_id, starts_on, status)
       SELECT
        printf('enrol_science_%02d', n),
        printf('student_%02d', n),
        'series_y8_science',
        '2026-01-01',
        'active'
       FROM seq`,
    ),
    db.prepare(
      `WITH RECURSIVE seq(n) AS (
         SELECT 21
         UNION ALL
         SELECT n + 1 FROM seq WHERE n < 25
       )
       INSERT OR IGNORE INTO enrollments
         (id, student_id, class_series_id, starts_on, status)
       SELECT
        printf('enrol_other_%02d', n),
        printf('student_%02d', n),
        'series_other_teacher',
        '2026-01-01',
        'active'
       FROM seq`,
    ),
  ];

  await db.batch(statements);
}
