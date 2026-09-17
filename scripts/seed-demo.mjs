import { spawnSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const projectRoot = process.cwd();
const configuredStateDirectory =
  process.env.AUS_D1_STATE_DIRECTORY ?? ".wrangler/state";
const stateDirectory = isAbsolute(configuredStateDirectory)
  ? configuredStateDirectory
  : join(projectRoot, configuredStateDirectory);
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
const dateFromOffset = (days) => {
  const value = new Date(`${today}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const tomorrow = dateFromOffset(1);
const yesterday = dateFromOffset(-1);
const monthStart = `${today.slice(0, 7)}-01`;
const [currentYear, currentMonth] = today.split("-").map(Number);
const monthEnd = new Date(Date.UTC(currentYear, currentMonth, 0))
  .toISOString()
  .slice(0, 10);
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
  ('staff_admin_liam', 'demo_admin_liam', 'liam@example.test', 'Liam Wilson', 'admin', 1),
  ('staff_manager_ava', 'demo_manager_ava', 'ava@example.test', 'Ava Thompson', 'manager', 1);

WITH RECURSIVE seq(n) AS (
  SELECT 3
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 10
)
INSERT OR IGNORE INTO staff_users
  (id, auth_user_id, email, display_name, role, active)
SELECT
  printf('staff_admin_scale_%02d', n),
  printf('demo_admin_scale_%02d', n),
  printf('operations%02d@example.test', n),
  printf('Operations Admin %02d', n),
  'admin',
  1
FROM seq;

WITH RECURSIVE seq(n) AS (
  SELECT 3
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 20
)
INSERT OR IGNORE INTO staff_users
  (id, auth_user_id, email, display_name, role, active)
SELECT
  printf('staff_teacher_scale_%02d', n),
  printf('demo_teacher_scale_%02d', n),
  printf('teacher%02d@example.test', n),
  printf('Teacher %02d', n),
  'teacher',
  1
FROM seq;

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

WITH RECURSIVE seq(n) AS (
  SELECT 31
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 1000
)
INSERT OR IGNORE INTO students
  (id, legal_name, preferred_name, date_of_birth, lifecycle_status, owner_admin_id)
SELECT
  printf('student_scale_%04d', n),
  printf('Scale Student %04d', n),
  printf('Student %04d', n),
  printf('%04d-%02d-%02d', 2010 + (n % 6), 1 + (n % 12), 1 + (n % 27)),
  CASE
    WHEN n % 29 = 0 THEN 'paused'
    WHEN n % 31 = 0 THEN 'inactive'
    ELSE 'active'
  END,
  CASE
    WHEN n <= 101 THEN 'staff_admin_sofia'
    WHEN n <= 200 THEN 'staff_admin_liam'
    ELSE printf('staff_admin_scale_%02d', CAST((n - 1) / 100 AS INTEGER) + 1)
  END
FROM seq;

INSERT OR IGNORE INTO guardians (id, full_name, email, phone)
VALUES
  ('guardian_01', 'Grace Chen', 'grace@example.test', '0400 000 001'),
  ('guardian_02', 'Daniel Wang', 'daniel@example.test', '0400 000 002'),
  ('guardian_03', 'Jenny Li', 'jenny@example.test', '0400 000 003');

WITH RECURSIVE seq(n) AS (
  SELECT 31
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 1000
)
INSERT OR IGNORE INTO guardians (id, full_name, email, phone)
SELECT
  printf('guardian_scale_%04d', n),
  printf('Guardian %04d', n),
  printf('guardian%04d@example.test', n),
  printf('04%08d', n)
FROM seq;

INSERT OR IGNORE INTO student_guardians
  (student_id, guardian_id, relationship, is_primary)
VALUES
  ('student_01', 'guardian_01', 'mother', 1),
  ('student_02', 'guardian_02', 'father', 1),
  ('student_05', 'guardian_03', 'mother', 1);

INSERT OR IGNORE INTO student_guardians
  (student_id, guardian_id, relationship, is_primary)
SELECT
  student.id,
  'guardian_scale_' || substr(student.id, -4),
  'guardian',
  1
FROM students AS student
WHERE student.id LIKE 'student_scale_%';

INSERT OR IGNORE INTO credit_accounts (id, student_id)
SELECT 'credits_' || id, id FROM students;

INSERT OR IGNORE INTO credit_transactions
  (id, account_id, kind, quantity, source_type, source_id, note, created_by_id)
SELECT
  'credit_opening_' || student.id,
  account.id,
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
JOIN credit_accounts AS account ON account.student_id=student.id
WHERE student.id <> 'student_05'
  AND student.id GLOB 'student_[0-9][0-9]';

INSERT OR IGNORE INTO credit_transactions
  (id, account_id, kind, quantity, source_type, source_id, note, created_by_id)
SELECT
  'credit_opening_' || student.id,
  account.id,
  'purchase',
  4 + (CAST(substr(student.id, -4) AS INTEGER) % 13),
  'seed',
  'opening_balance',
  'Synthetic scale opening balance',
  student.owner_admin_id
FROM students AS student
JOIN credit_accounts AS account ON account.student_id=student.id
WHERE student.id LIKE 'student_scale_%';

INSERT OR IGNORE INTO class_series
  (id, name, subject, room, weekday, local_start_time, local_end_time, default_teacher_id, capacity, active)
VALUES
  ('series_y6_math', 'Year 6 Mathematics', 'Mathematics', 'Room 4', ${weekday}, '${active.start}', '${active.end}', 'staff_teacher_mei', 10, 1),
  ('series_y5_english', 'Year 5 English', 'English', 'Room 2', ${weekday}, '${secondary.start}', '${secondary.end}', 'staff_teacher_mei', 12, 1),
  ('series_y8_science', 'Year 8 Science', 'Science', 'Lab 1', ${weekday}, '${tertiary.start}', '${tertiary.end}', 'staff_teacher_mei', 12, 1),
  ('series_other_teacher', 'Year 7 Writing', 'English', 'Room 3', ${weekday}, '${active.start}', '${active.end}', 'staff_teacher_arjun', 10, 1);

INSERT INTO lesson_sessions
  (id, class_series_id, teacher_id, session_date, local_start_time, local_end_time, status)
SELECT '${sessionIds.math}', 'series_y6_math', 'staff_teacher_mei', '${today}', '${active.start}', '${active.end}', 'scheduled'
WHERE NOT EXISTS (SELECT 1 FROM lesson_sessions WHERE id='${sessionIds.math}')
UNION ALL
SELECT '${sessionIds.english}', 'series_y5_english', 'staff_teacher_mei', '${today}', '${secondary.start}', '${secondary.end}', 'scheduled'
WHERE NOT EXISTS (SELECT 1 FROM lesson_sessions WHERE id='${sessionIds.english}')
UNION ALL
SELECT '${sessionIds.science}', 'series_y8_science', 'staff_teacher_mei', '${today}', '${tertiary.start}', '${tertiary.end}', 'scheduled'
WHERE NOT EXISTS (SELECT 1 FROM lesson_sessions WHERE id='${sessionIds.science}')
UNION ALL
SELECT '${sessionIds.other}', 'series_other_teacher', 'staff_teacher_arjun', '${today}', '${active.start}', '${active.end}', 'scheduled'
WHERE NOT EXISTS (SELECT 1 FROM lesson_sessions WHERE id='${sessionIds.other}');

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

INSERT OR IGNORE INTO organizations (id,name,timezone,status)
VALUES ('org_austin','Austin Education','Australia/Melbourne','active');

INSERT OR IGNORE INTO user_accounts
  (id,organization_id,auth_user_id,email,display_name,status)
VALUES
  ('account_demo','org_austin','local_seedy','seedy@sites.test','Demo User','active'),
  ('account_independent_manager','org_austin','demo_independent_manager',
   'manager2@example.test','Independent Manager','active'),
  ('account_operations_02','org_austin','demo_admin_liam',
   'liam@example.test','Liam Wilson','active'),
  ('account_teacher_02','org_austin','demo_teacher_arjun',
   'arjun@example.test','Arjun Patel','active');

WITH RECURSIVE seq(n) AS (
  SELECT 3
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 10
)
INSERT OR IGNORE INTO user_accounts
  (id,organization_id,auth_user_id,email,display_name,status)
SELECT
  printf('account_operations_%02d', n),
  'org_austin',
  printf('demo_admin_scale_%02d', n),
  printf('operations%02d@example.test', n),
  printf('Operations Admin %02d', n),
  'active'
FROM seq;

WITH RECURSIVE seq(n) AS (
  SELECT 3
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 20
)
INSERT OR IGNORE INTO user_accounts
  (id,organization_id,auth_user_id,email,display_name,status)
SELECT
  printf('account_teacher_%02d', n),
  'org_austin',
  printf('demo_teacher_scale_%02d', n),
  printf('teacher%02d@example.test', n),
  printf('Teacher %02d', n),
  'active'
FROM seq;

INSERT OR IGNORE INTO account_role_assignments
  (id,account_id,role,staff_user_id,student_id,guardian_id,scope_type,scope_id,active)
VALUES
  ('role_demo_teacher','account_demo','teacher','staff_teacher_mei',NULL,NULL,'self','staff_teacher_mei',1),
  ('role_demo_operations','account_demo','operations_admin','staff_admin_sofia',NULL,NULL,'owner','staff_admin_sofia',1),
  ('role_demo_manager','account_demo','manager_admin','staff_manager_ava',NULL,NULL,'organization','org_austin',1),
  ('role_demo_student','account_demo','student',NULL,'student_01',NULL,'self','student_01',1),
  ('role_demo_guardian','account_demo','guardian',NULL,NULL,'guardian_01','self','guardian_01',1),
  ('role_demo_system','account_demo','system_admin',NULL,NULL,NULL,'organization','org_austin',1),
  ('role_independent_manager','account_independent_manager','manager_admin','staff_manager_ava',NULL,NULL,'organization','org_austin',1),
  ('role_operations_02','account_operations_02','operations_admin','staff_admin_liam',NULL,NULL,'owner','staff_admin_liam',1),
  ('role_teacher_02','account_teacher_02','teacher','staff_teacher_arjun',NULL,NULL,'self','staff_teacher_arjun',1);

WITH RECURSIVE seq(n) AS (
  SELECT 3
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 10
)
INSERT OR IGNORE INTO account_role_assignments
  (id,account_id,role,staff_user_id,student_id,guardian_id,scope_type,scope_id,active)
SELECT
  printf('role_operations_%02d', n),
  printf('account_operations_%02d', n),
  'operations_admin',
  printf('staff_admin_scale_%02d', n),
  NULL,
  NULL,
  'owner',
  printf('staff_admin_scale_%02d', n),
  1
FROM seq;

WITH RECURSIVE seq(n) AS (
  SELECT 3
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 20
)
INSERT OR IGNORE INTO account_role_assignments
  (id,account_id,role,staff_user_id,student_id,guardian_id,scope_type,scope_id,active)
SELECT
  printf('role_teacher_%02d', n),
  printf('account_teacher_%02d', n),
  'teacher',
  printf('staff_teacher_scale_%02d', n),
  NULL,
  NULL,
  'self',
  printf('staff_teacher_scale_%02d', n),
  1
FROM seq;

INSERT OR IGNORE INTO organization_settings
  (id,organization_id,setting_key,value_json,updated_by_id)
VALUES
  ('setting_attendance','org_austin','attendance.policy',
   '{"presentBillable":true,"lateBillable":true,"absentBillable":false,"trialBillable":false}',
   'staff_manager_ava'),
  ('setting_locale','org_austin','organization.locale',
   '{"language":"en-AU","timezone":"Australia/Melbourne","currency":"AUD"}',
   'staff_manager_ava'),
  ('setting_renewal','org_austin','renewal.threshold',
   '{"credits":3}',
   'staff_manager_ava');

INSERT OR IGNORE INTO programs
  (id,organization_id,name,subject,default_session_minutes,active)
VALUES
  ('program_math','org_austin','Core Mathematics','Mathematics',60,1),
  ('program_english','org_austin','English Foundations','English',60,1),
  ('program_science','org_austin','Science Lab','Science',60,1);

INSERT OR IGNORE INTO class_series_programs (class_series_id,program_id)
VALUES
  ('series_y6_math','program_math'),
  ('series_y5_english','program_english'),
  ('series_y8_science','program_science'),
  ('series_other_teacher','program_english');

INSERT OR IGNORE INTO rooms (id,organization_id,name,capacity,active)
VALUES
  ('room_2','org_austin','Room 2',12,1),
  ('room_3','org_austin','Room 3',10,1),
  ('room_4','org_austin','Room 4',10,1),
  ('room_lab_1','org_austin','Lab 1',12,1),
  ('room_5','org_austin','Room 5',8,1);

WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 8
)
INSERT OR IGNORE INTO rooms (id,organization_id,name,capacity,active)
SELECT
  printf('room_scale_%02d', n),
  'org_austin',
  printf('Scale Room %02d', n),
  14,
  1
FROM seq;

WITH RECURSIVE seq(n) AS (
  SELECT 5
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 60
)
INSERT OR IGNORE INTO class_series
  (id,name,subject,room,weekday,local_start_time,local_end_time,
   session_kind,default_teacher_id,capacity,active)
SELECT
  printf('series_scale_%02d', n),
  printf('Weekly Class %02d', n),
  CASE n % 3 WHEN 0 THEN 'Mathematics' WHEN 1 THEN 'English' ELSE 'Science' END,
  printf('Scale Room %02d', 1 + ((n - 1) % 8)),
  1 + ((n - 1) % 6),
  printf('%02d:00', 9 + ((n - 1) % 8)),
  printf('%02d:00', 10 + ((n - 1) % 8)),
  'regular',
  CASE 1 + ((n - 1) % 20)
    WHEN 1 THEN 'staff_teacher_mei'
    WHEN 2 THEN 'staff_teacher_arjun'
    ELSE printf('staff_teacher_scale_%02d', 1 + ((n - 1) % 20))
  END,
  14,
  1
FROM seq;

INSERT OR IGNORE INTO class_series_programs (class_series_id,program_id)
SELECT
  series.id,
  CASE series.subject
    WHEN 'Mathematics' THEN 'program_math'
    WHEN 'English' THEN 'program_english'
    ELSE 'program_science'
  END
FROM class_series AS series
WHERE series.id LIKE 'series_scale_%';

UPDATE students SET lifecycle_status='prospect'
WHERE id IN ('student_26','student_27','student_28','student_29','student_30');

UPDATE students SET owner_admin_id='staff_admin_liam'
WHERE id='student_30';

INSERT OR IGNORE INTO guardians (id,full_name,email,phone)
VALUES
  ('guardian_26','Taylor Demo','taylor26@example.test','0400 000 026'),
  ('guardian_27','Jordan Demo','jordan27@example.test','0400 000 027'),
  ('guardian_28','Casey Demo','casey28@example.test','0400 000 028');

INSERT OR IGNORE INTO student_guardians
  (student_id,guardian_id,relationship,is_primary)
VALUES
  ('student_26','guardian_26','guardian',1),
  ('student_27','guardian_27','guardian',1),
  ('student_28','guardian_28','guardian',1),
  ('student_02','guardian_01','guardian',0);

INSERT OR IGNORE INTO inquiries
  (id,organization_id,student_id,guardian_id,owner_admin_id,source,status,notes,next_follow_up_at)
VALUES
  ('inquiry_new_26','org_austin','student_26','guardian_26','staff_admin_sofia',
   'Website','new','Interested in mathematics',datetime('now','-2 hours')),
  ('inquiry_trial_27','org_austin','student_27','guardian_27','staff_admin_sofia',
   'Referral','trial_scheduled','Trial confirmed',datetime('now','+1 day')),
  ('inquiry_completed_28','org_austin','student_28','guardian_28','staff_admin_sofia',
   'Walk-in','trial_scheduled','Attendance completed; outcome still pending',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO follow_up_tasks
  (id,organization_id,student_id,inquiry_id,assignee_id,task_type,status,due_at)
VALUES
  ('followup_overdue_26','org_austin','student_26','inquiry_new_26','staff_admin_sofia',
   'general','open',datetime('now','-2 hours')),
  ('followup_trial_27','org_austin','student_27','inquiry_trial_27','staff_admin_sofia',
   'trial_follow_up','open',datetime('now','+2 days'));

INSERT OR IGNORE INTO class_series
  (id,name,subject,room,weekday,local_start_time,local_end_time,session_kind,
   default_teacher_id,capacity,active)
VALUES
  ('trial_series_seed','Trial · Mathematics','Mathematics','Room 5',
   CAST(strftime('%w','${tomorrow}') AS INTEGER),'10:00','11:00','trial',
   'staff_teacher_arjun',4,0),
  ('trial_series_completed_seed','Trial · English','English','Room 5',
   CAST(strftime('%w','${yesterday}') AS INTEGER),'12:00','13:00','trial',
   'staff_teacher_arjun',4,0);

INSERT INTO lesson_sessions
  (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
   session_kind,status)
SELECT 'trial_session_seed','trial_series_seed','staff_teacher_arjun','${tomorrow}',
       '10:00','11:00','trial','scheduled'
WHERE NOT EXISTS (SELECT 1 FROM lesson_sessions WHERE id='trial_session_seed');

INSERT INTO lesson_sessions
  (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
   session_kind,status,roster_frozen_at)
SELECT 'session_payroll_seed','series_y6_math','staff_teacher_mei','${yesterday}',
       '10:00','11:00','regular','completed',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM lesson_sessions WHERE id='session_payroll_seed');

INSERT INTO lesson_sessions
  (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
   session_kind,status)
SELECT 'trial_session_completed_seed','trial_series_completed_seed','staff_teacher_arjun',
       '${yesterday}','12:00','13:00','trial','scheduled'
WHERE NOT EXISTS (SELECT 1 FROM lesson_sessions WHERE id='trial_session_completed_seed');

INSERT OR IGNORE INTO session_participants
  (id,lesson_session_id,student_id,credit_account_id,display_name,date_of_birth,
   is_new,source,sort_order)
SELECT 'participant_trial_seed','trial_session_seed',student.id,account.id,
       COALESCE(student.preferred_name,student.legal_name),student.date_of_birth,
       1,'trial',1
FROM students student JOIN credit_accounts account ON account.student_id=student.id
WHERE student.id='student_27';

INSERT OR IGNORE INTO session_participants
  (id,lesson_session_id,student_id,credit_account_id,display_name,date_of_birth,
   is_new,source,sort_order)
SELECT 'participant_trial_completed_seed','trial_session_completed_seed',student.id,account.id,
       COALESCE(student.preferred_name,student.legal_name),student.date_of_birth,
       1,'trial',1
FROM students student JOIN credit_accounts account ON account.student_id=student.id
WHERE student.id='student_28';

UPDATE lesson_sessions SET roster_frozen_at=COALESCE(roster_frozen_at,CURRENT_TIMESTAMP)
WHERE id='trial_session_completed_seed';

INSERT INTO attendance
  (id,lesson_session_id,student_id,status,billing_status,recorded_by_id)
SELECT 'attendance_trial_completed_seed','trial_session_completed_seed','student_28',
       'present','not_charged','staff_teacher_arjun'
WHERE NOT EXISTS (
  SELECT 1 FROM attendance WHERE id='attendance_trial_completed_seed'
);

UPDATE lesson_sessions
SET status='completed',completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),
    completed_by_id=COALESCE(completed_by_id,'staff_teacher_arjun')
WHERE id='trial_session_completed_seed' AND status='scheduled';

INSERT OR IGNORE INTO trial_bookings
  (id,inquiry_id,lesson_session_id,outcome,conversion_decision)
VALUES
  ('trial_booking_seed','inquiry_trial_27','trial_session_seed','pending','pending'),
  ('trial_booking_completed_seed','inquiry_completed_28','trial_session_completed_seed',
   'pending','pending');

UPDATE lesson_sessions SET roster_frozen_at=COALESCE(roster_frozen_at,CURRENT_TIMESTAMP)
WHERE id='trial_session_seed';

INSERT OR IGNORE INTO teacher_pay_rates
  (id,teacher_id,session_kind,amount_cents,starts_on)
VALUES
  ('rate_mei_regular','staff_teacher_mei','regular',6500,'2026-01-01'),
  ('rate_mei_trial','staff_teacher_mei','trial',4500,'2026-01-01'),
  ('rate_arjun_regular','staff_teacher_arjun','regular',6200,'2026-01-01'),
  ('rate_arjun_trial','staff_teacher_arjun','trial',4200,'2026-01-01');

INSERT OR IGNORE INTO payroll_periods
  (id,organization_id,starts_on,ends_on,status)
VALUES ('payroll_current','org_austin','${monthStart}','${monthEnd}','open');

INSERT OR IGNORE INTO payroll_entries
  (id,payroll_period_id,lesson_session_id,teacher_id,session_kind,minutes,
   base_amount_cents,adjustment_cents,status,note)
VALUES
  ('payroll_seed_entry','payroll_current','session_payroll_seed','staff_teacher_mei',
   'regular',60,6500,0,'accrued','Seeded completed lesson'),
  ('payroll_trial_seed_entry','payroll_current','trial_session_completed_seed',
   'staff_teacher_arjun','trial',60,4200,0,'accrued','Seeded completed trial lesson');

INSERT OR IGNORE INTO orders
  (id,organization_id,student_id,created_by_account_id,order_type,status,
   amount_cents,credit_quantity,currency,description,paid_at)
VALUES
  ('order_paid_seed','org_austin','student_01','account_demo','credit_top_up','paid',
   36000,6,'AUD','Six lesson renewal package',CURRENT_TIMESTAMP),
  ('order_pending_seed','org_austin','student_01','account_demo','credit_top_up','pending',
   24000,4,'AUD','Four lesson renewal package',NULL);

INSERT OR IGNORE INTO payment_transactions
  (id,order_id,provider,provider_event_id,transaction_type,status,amount_cents,raw_reference)
VALUES
  ('payment_seed','order_paid_seed','sandbox','seed_payment_event','payment','succeeded',
   36000,'Synthetic provider reference');

INSERT OR IGNORE INTO credit_transactions
  (id,account_id,kind,quantity,source_type,source_id,note,created_by_id)
VALUES
  ('credit_order_paid_seed','credits_student_01','purchase',6,'order','order_paid_seed',
   'Paid lesson-credit order','staff_admin_sofia');

INSERT OR IGNORE INTO refunds
  (id,order_id,requested_by_id,status,amount_cents,reason)
VALUES
  ('refund_requested_seed','order_paid_seed','staff_admin_sofia','requested',36000,
   'Guardian requested cancellation before using this package');

INSERT OR IGNORE INTO messages
  (id,organization_id,student_id,guardian_id,created_by_id,channel,subject,body,status,sent_at)
VALUES
  ('message_welcome_seed','org_austin','student_01','guardian_01','staff_admin_sofia',
   'in_app','Welcome','Your next class and current balance are available in the portal.',
   'sent',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO integration_configs
  (id,organization_id,integration_type,provider_name,mode,public_config_json,status,last_checked_at,updated_by_id)
VALUES
  ('integration_identity','org_austin','identity','ChatGPT Identity','live','{}','healthy',CURRENT_TIMESTAMP,'staff_manager_ava'),
  ('integration_llm','org_austin','llm','Google Gemini','sandbox','{"privacyControl":"redacted-before-send"}','healthy',CURRENT_TIMESTAMP,'staff_manager_ava'),
  ('integration_payment','org_austin','payment','SandboxPay','sandbox','{"currency":"AUD"}','healthy',CURRENT_TIMESTAMP,'staff_manager_ava'),
  ('integration_bank','org_austin','bank','Bank export','sandbox','{}','unknown',CURRENT_TIMESTAMP,'staff_manager_ava'),
  ('integration_email','org_austin','email','Mail sandbox','sandbox','{}','healthy',CURRENT_TIMESTAMP,'staff_manager_ava'),
  ('integration_sms','org_austin','sms','SMS sandbox','sandbox','{}','degraded',CURRENT_TIMESTAMP,'staff_manager_ava'),
  ('integration_wechat','org_austin','wechat','WeChat adapter','disabled','{}','unknown',CURRENT_TIMESTAMP,'staff_manager_ava');

INSERT OR IGNORE INTO system_jobs
  (id,organization_id,job_type,status,payload_json,attempts,requested_by_account_id,last_error)
VALUES
  ('job_failed_seed','org_austin','daily_balance_reminder','failed','{"dryRun":true}',3,
   'account_demo','Sandbox SMS adapter unavailable');

INSERT OR IGNORE INTO outbox_events
  (id,organization_id,event_type,aggregate_type,aggregate_id,dedupe_key,payload_json,status)
VALUES
  ('outbox_pending_seed','org_austin','renewal.reminder','student','student_04',
   'renewal.reminder:student_04:seed','{"studentId":"student_04"}','pending');
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
      stateDirectory,
      "--file",
      seedFile,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error(
      "Demo seed failed. Build/apply migrations first; if the demo was already used, run npm run demo:reset.",
    );
  }
  console.log(
    `Demo data ready for ${today}: 1,000 students, 10 operations admins, 20 teachers, and 60 weekly classes.`,
  );
} finally {
  if (process.env.AUS_KEEP_SEED === "1") {
    console.error(`Seed SQL kept for diagnostics: ${seedFile}`);
  } else {
    unlinkSync(seedFile);
  }
}
