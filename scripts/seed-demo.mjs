import { spawnSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const stateDirectory = join(projectRoot, ".wrangler");
const seedFile = join(stateDirectory, `seed-demo-${process.pid}.sql`);

function melbourneParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function minutesToTime(value) {
  const safe = Math.max(0, Math.min(24 * 60 - 1, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(
    safe % 60,
  ).padStart(2, "0")}`;
}

function lessonWindow(startMinutes) {
  const start = Math.max(0, Math.min(24 * 60 - 61, startMinutes));
  return { start: minutesToTime(start), end: minutesToTime(start + 60) };
}

const now = melbourneParts();
const today = `${now.year}-${now.month}-${now.day}`;
const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
const activeStart = Math.max(0, Math.min(24 * 60 - 61, currentMinutes - 30));
const alternatives = [-120, 120, -240, 240]
  .map((offset) => activeStart + offset)
  .filter((value) => value >= 0 && value <= 24 * 60 - 61);
const active = lessonWindow(activeStart);
const secondary = lessonWindow(alternatives[0] ?? Math.max(0, activeStart - 90));
const tertiary = lessonWindow(
  alternatives[1] ?? Math.min(24 * 60 - 61, activeStart + 90),
);

const sessionIds = {
  math: `session_y6_math_${today}`,
  english: `session_y5_english_${today}`,
  science: `session_y8_science_${today}`,
  other: `session_other_teacher_${today}`,
};

const sql = `
INSERT OR IGNORE INTO staff_users
  (id, auth_user_id, email, display_name, role, active)
VALUES
  ('staff_teacher_mei', 'local_seedy', 'seedy@sites.test', 'Mei Lin', 'teacher', 1),
  ('staff_teacher_arjun', 'demo_teacher_arjun', 'arjun@example.test', 'Arjun Patel', 'teacher', 1),
  ('staff_admin_sofia', 'demo_admin_sofia', 'sofia@example.test', 'Sofia Nguyen', 'admin', 1),
  ('staff_manager_ava', 'demo_manager_ava', 'ava@example.test', 'Ava Thompson', 'manager', 1);

INSERT OR IGNORE INTO students
  (id, legal_name, preferred_name, date_of_birth, lifecycle_status, owner_admin_id)
VALUES
  ('student_01', 'Olivia Chen', 'Olivia', '2014-02-18', 'active', 'staff_admin_sofia'),
  ('student_02', 'Ethan Wang', 'Ethan', '2013-11-03', 'active', 'staff_admin_sofia'),
  ('student_03', 'Sophie Liu', 'Sophie', '2014-05-27', 'active', 'staff_admin_sofia'),
  ('student_04', 'Noah Zhang', 'Noah', '2013-08-16', 'active', 'staff_admin_sofia'),
  ('student_05', 'Mia Li', 'Mia', '2014-01-09', 'active', 'staff_admin_sofia');

WITH RECURSIVE seq(n) AS (
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
FROM seq;

INSERT OR IGNORE INTO guardians (id, full_name, email, phone)
VALUES
  ('guardian_01', 'Grace Chen', 'grace@example.test', '0400 000 001'),
  ('guardian_02', 'Daniel Wang', 'daniel@example.test', '0400 000 002'),
  ('guardian_03', 'Jenny Li', 'jenny@example.test', '0400 000 003');

INSERT OR IGNORE INTO student_guardians
  (student_id, guardian_id, relationship, is_primary)
VALUES
  ('student_01', 'guardian_01', 'mother', 1),
  ('student_02', 'guardian_02', 'father', 1),
  ('student_05', 'guardian_03', 'mother', 1);

INSERT OR IGNORE INTO credit_accounts (id, student_id)
SELECT 'credits_' || id, id FROM students;

INSERT OR IGNORE INTO credit_transactions
  (id, account_id, kind, quantity, source_type, source_id, note, created_by_id)
SELECT
  'credit_opening_' || student.id,
  'credits_' || student.id,
  'purchase',
  CASE student.id
    WHEN 'student_01' THEN 8
    WHEN 'student_02' THEN 3
    WHEN 'student_03' THEN 14
    WHEN 'student_04' THEN 1
    ELSE 10
  END,
  'seed',
  'opening_balance',
  'Synthetic opening balance',
  'staff_admin_sofia'
FROM students AS student
WHERE student.id <> 'student_05';

INSERT OR IGNORE INTO class_series
  (id, name, subject, room, weekday, local_start_time, local_end_time, default_teacher_id, capacity, active)
VALUES
  ('series_y6_math', 'Year 6 Mathematics', 'Mathematics', 'Room 4', ${weekday}, '${active.start}', '${active.end}', 'staff_teacher_mei', 10, 1),
  ('series_y5_english', 'Year 5 English', 'English', 'Room 2', ${weekday}, '${secondary.start}', '${secondary.end}', 'staff_teacher_mei', 12, 1),
  ('series_y8_science', 'Year 8 Science', 'Science', 'Lab 1', ${weekday}, '${tertiary.start}', '${tertiary.end}', 'staff_teacher_mei', 12, 1),
  ('series_other_teacher', 'Year 7 Writing', 'English', 'Room 3', ${weekday}, '${active.start}', '${active.end}', 'staff_teacher_arjun', 10, 1);

INSERT OR IGNORE INTO lesson_sessions
  (id, class_series_id, teacher_id, session_date, local_start_time, local_end_time, status)
VALUES
  ('${sessionIds.math}', 'series_y6_math', 'staff_teacher_mei', '${today}', '${active.start}', '${active.end}', 'scheduled'),
  ('${sessionIds.english}', 'series_y5_english', 'staff_teacher_mei', '${today}', '${secondary.start}', '${secondary.end}', 'scheduled'),
  ('${sessionIds.science}', 'series_y8_science', 'staff_teacher_mei', '${today}', '${tertiary.start}', '${tertiary.end}', 'scheduled'),
  ('${sessionIds.other}', 'series_other_teacher', 'staff_teacher_arjun', '${today}', '${active.start}', '${active.end}', 'scheduled');

INSERT OR IGNORE INTO enrollments
  (id, student_id, class_series_id, starts_on, status)
VALUES
  ('enrol_math_01', 'student_01', 'series_y6_math', '${today}', 'active'),
  ('enrol_math_02', 'student_02', 'series_y6_math', '2026-01-01', 'active'),
  ('enrol_math_03', 'student_03', 'series_y6_math', '2026-01-01', 'active'),
  ('enrol_math_04', 'student_04', 'series_y6_math', '2026-01-01', 'active'),
  ('enrol_math_05', 'student_05', 'series_y6_math', '2026-01-01', 'active');

WITH RECURSIVE seq(n) AS (
  SELECT 6
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 12
)
INSERT OR IGNORE INTO enrollments
  (id, student_id, class_series_id, starts_on, status)
SELECT printf('enrol_english_%02d', n), printf('student_%02d', n),
       'series_y5_english', '2026-01-01', 'active'
FROM seq;

WITH RECURSIVE seq(n) AS (
  SELECT 13
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 20
)
INSERT OR IGNORE INTO enrollments
  (id, student_id, class_series_id, starts_on, status)
SELECT printf('enrol_science_%02d', n), printf('student_%02d', n),
       'series_y8_science', '2026-01-01', 'active'
FROM seq;

WITH RECURSIVE seq(n) AS (
  SELECT 21
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 25
)
INSERT OR IGNORE INTO enrollments
  (id, student_id, class_series_id, starts_on, status)
SELECT printf('enrol_other_%02d', n), printf('student_%02d', n),
       'series_other_teacher', '2026-01-01', 'active'
FROM seq;

INSERT OR IGNORE INTO session_participants
  (id, lesson_session_id, student_id, enrollment_id, credit_account_id,
   display_name, date_of_birth, is_new, source, sort_order)
SELECT
  'participant_' || '${sessionIds.math}' || '_' || student.id,
  '${sessionIds.math}',
  student.id,
  enrollment.id,
  account.id,
  COALESCE(student.preferred_name, student.legal_name),
  student.date_of_birth,
  CASE WHEN student.id = 'student_01' THEN 1 ELSE 0 END,
  'enrollment',
  CAST(substr(student.id, -2) AS INTEGER)
FROM enrollments AS enrollment
JOIN students AS student ON student.id = enrollment.student_id
JOIN credit_accounts AS account ON account.student_id = student.id
WHERE enrollment.class_series_id = 'series_y6_math'
  AND enrollment.status = 'active';

INSERT OR IGNORE INTO session_participants
  (id, lesson_session_id, student_id, enrollment_id, credit_account_id,
   display_name, date_of_birth, is_new, source, sort_order)
SELECT
  'participant_' || '${sessionIds.english}' || '_' || student.id,
  '${sessionIds.english}', student.id, enrollment.id, account.id,
  COALESCE(student.preferred_name, student.legal_name), student.date_of_birth,
  0, 'enrollment', CAST(substr(student.id, -2) AS INTEGER)
FROM enrollments AS enrollment
JOIN students AS student ON student.id = enrollment.student_id
JOIN credit_accounts AS account ON account.student_id = student.id
WHERE enrollment.class_series_id = 'series_y5_english'
  AND enrollment.status = 'active';

INSERT OR IGNORE INTO session_participants
  (id, lesson_session_id, student_id, enrollment_id, credit_account_id,
   display_name, date_of_birth, is_new, source, sort_order)
SELECT
  'participant_' || '${sessionIds.science}' || '_' || student.id,
  '${sessionIds.science}', student.id, enrollment.id, account.id,
  COALESCE(student.preferred_name, student.legal_name), student.date_of_birth,
  0, 'enrollment', CAST(substr(student.id, -2) AS INTEGER)
FROM enrollments AS enrollment
JOIN students AS student ON student.id = enrollment.student_id
JOIN credit_accounts AS account ON account.student_id = student.id
WHERE enrollment.class_series_id = 'series_y8_science'
  AND enrollment.status = 'active';

INSERT OR IGNORE INTO session_participants
  (id, lesson_session_id, student_id, enrollment_id, credit_account_id,
   display_name, date_of_birth, is_new, source, sort_order)
SELECT
  'participant_' || '${sessionIds.other}' || '_' || student.id,
  '${sessionIds.other}', student.id, enrollment.id, account.id,
  COALESCE(student.preferred_name, student.legal_name), student.date_of_birth,
  0, 'enrollment', CAST(substr(student.id, -2) AS INTEGER)
FROM enrollments AS enrollment
JOIN students AS student ON student.id = enrollment.student_id
JOIN credit_accounts AS account ON account.student_id = student.id
WHERE enrollment.class_series_id = 'series_other_teacher'
  AND enrollment.status = 'active';

UPDATE lesson_sessions
SET roster_frozen_at = COALESCE(roster_frozen_at, CURRENT_TIMESTAMP)
WHERE id IN (
  '${sessionIds.math}',
  '${sessionIds.english}',
  '${sessionIds.science}',
  '${sessionIds.other}'
);
`;

mkdirSync(stateDirectory, { recursive: true });
writeFileSync(seedFile, sql, "utf8");

try {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      "--file",
      seedFile,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error("Demo seed failed. Build and apply migrations first.");
  }
  console.log(
    `Demo data ready for ${today}. Mia has zero credits; Olivia is the only new student in the active class.`,
  );
} finally {
  unlinkSync(seedFile);
}
