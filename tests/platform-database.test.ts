import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const projectRoot = process.cwd();

function migrationFiles() {
  return readdirSync(join(projectRoot, "drizzle"))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

function apply(db: DatabaseSync, files = migrationFiles()) {
  for (const file of files) {
    db.exec(readFileSync(join(projectRoot, "drizzle", file), "utf8"));
  }
}

function platformDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  apply(db);
  db.exec(`
    INSERT INTO staff_users
      (id,auth_user_id,email,display_name,role,active)
    VALUES
      ('teacher_1','auth_teacher_1','teacher1@example.test','Teacher One','teacher',1),
      ('teacher_2','auth_teacher_2','teacher2@example.test','Teacher Two','teacher',1),
      ('admin_1','auth_admin_1','admin@example.test','Admin One','admin',1),
      ('manager_1','auth_manager_1','manager@example.test','Manager One','manager',1);
    INSERT INTO students
      (id,legal_name,date_of_birth,lifecycle_status,owner_admin_id)
    VALUES
      ('student_1','Student One','2014-01-01','active','admin_1'),
      ('student_2','Student Two','2014-02-01','prospect','admin_1');
    INSERT INTO guardians (id,full_name,email)
    VALUES ('guardian_1','Guardian One','guardian@example.test');
    INSERT INTO student_guardians (student_id,guardian_id,relationship,is_primary)
    VALUES ('student_1','guardian_1','guardian',1);
    INSERT INTO credit_accounts (id,student_id)
    VALUES ('credits_1','student_1'),('credits_2','student_2');
    INSERT INTO organizations (id,name,status)
    VALUES ('org_1','Organization One','active');
    INSERT INTO user_accounts
      (id,organization_id,auth_user_id,email,display_name,status)
    VALUES ('account_1','org_1','auth_account_1','account@example.test','Account One','active');
    INSERT INTO rooms (id,organization_id,name,capacity,active)
    VALUES
      ('room_a','org_1','Room A',2,1),
      ('room_b','org_1','Room B',2,1),
      ('room_c','org_1','Room C',2,1);
    INSERT INTO class_series
      (id,name,subject,room,weekday,local_start_time,local_end_time,
       session_kind,default_teacher_id,capacity,active)
    VALUES
      ('series_a','Class A','Math','Room A',1,'10:00','11:00','regular','teacher_1',2,1),
      ('series_b','Class B','English','Room B',1,'11:00','12:00','regular','teacher_1',2,1),
      ('series_c','Class C','Science','Room C',1,'10:30','11:30','regular','teacher_2',2,1),
      ('trial_series','Trial','Trial','Room A',1,'14:00','15:00','trial','teacher_2',4,0);
    INSERT INTO lesson_sessions
      (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
       session_kind,status)
    VALUES
      ('session_a','series_a','teacher_1','2026-10-05','10:00','11:00','regular','scheduled'),
      ('session_trial','trial_series','teacher_2','2026-10-05','14:00','15:00','trial','scheduled');
  `);
  return db;
}

test("upgrade from 0006 preserves old rows and adds session-kind snapshots", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  apply(db, migrationFiles().filter((name) => name < "0007"));
  db.exec(`
    INSERT INTO staff_users
      (id,auth_user_id,email,display_name,role,active)
    VALUES ('teacher','auth','teacher@example.test','Teacher','teacher',1);
    INSERT INTO class_series
      (id,name,subject,room,weekday,local_start_time,local_end_time,
       default_teacher_id,capacity,active)
    VALUES ('series','Legacy class','Math','Room 1',1,'10:00','11:00','teacher',10,1);
    INSERT INTO lesson_sessions
      (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,status)
    VALUES ('session','series','teacher','2026-10-05','10:00','11:00','scheduled');
  `);
  apply(db, migrationFiles().filter((name) => name >= "0007"));
  const row = db.prepare(`SELECT series.session_kind AS seriesKind,
      session.session_kind AS sessionKind,series.name
    FROM class_series series JOIN lesson_sessions session
      ON session.class_series_id=series.id`).get() as {
    seriesKind: string;
    sessionKind: string;
    name: string;
  };
  assert.deepEqual({ ...row }, {
    seriesKind: "regular",
    sessionKind: "regular",
    name: "Legacy class",
  });
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("database rejects invalid enums, JSON and polymorphic role shapes", () => {
  const db = platformDatabase();
  assert.throws(
    () => db.exec("INSERT INTO organizations (id,name,status) VALUES ('bad','Bad','nonsense')"),
    /ck_organizations_status/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO account_role_assignments
      (id,account_id,role,scope_type,active)
      VALUES ('bad_teacher','account_1','teacher','organization',1)`),
    /ck_account_role_assignments_subject/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO account_role_assignments
      (id,account_id,role,student_id,guardian_id,scope_type,active)
      VALUES ('bad_guardian','account_1','guardian','student_1','guardian_1','self',1)`),
    /ck_account_role_assignments_subject/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO organization_settings
      (id,organization_id,setting_key,value_json)
      VALUES ('bad_json','org_1','bad','{')`),
    /ck_organization_settings_json/,
  );
  db.exec(`INSERT INTO account_role_assignments
    (id,account_id,role,staff_user_id,scope_type,active)
    VALUES ('valid_teacher','account_1','teacher','teacher_1','self',1)`);
});

test("schedule guards use half-open intervals for teacher, room and student", () => {
  const db = platformDatabase();
  db.exec(`INSERT INTO lesson_sessions
    (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
     session_kind,status)
    VALUES ('adjacent','series_b','teacher_1','2026-10-05','11:00','12:00','regular','scheduled')`);
  assert.throws(
    () => db.exec(`INSERT INTO lesson_sessions
      (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
       session_kind,status)
      VALUES ('teacher_overlap','series_b','teacher_1','2026-10-05','10:30','11:30','regular','scheduled')`),
    /SCHEDULE_CONFLICT/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO lesson_sessions
      (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
       session_kind,status)
      VALUES ('room_overlap','series_a','teacher_2','2026-10-05','10:30','10:45','regular','scheduled')`),
    /ROOM_SCHEDULE_CONFLICT/,
  );
  db.exec(`
    INSERT INTO lesson_sessions
      (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
       session_kind,status)
    VALUES ('student_overlap','series_c','teacher_2','2026-10-05','10:30','11:30','regular','scheduled');
    INSERT INTO session_participants
      (id,lesson_session_id,student_id,credit_account_id,display_name,date_of_birth,source)
    VALUES ('participant_a','session_a','student_1','credits_1','Student One','2014-01-01','enrollment');
  `);
  assert.throws(
    () => db.exec(`INSERT INTO session_participants
      (id,lesson_session_id,student_id,credit_account_id,display_name,date_of_birth,source)
      VALUES ('participant_overlap','student_overlap','student_1','credits_1','Student One','2014-01-01','enrollment')`),
    /STUDENT_SCHEDULE_CONFLICT/,
  );
});

test("one trial session can contain multiple trial bookings and participants", () => {
  const db = platformDatabase();
  db.exec(`
    INSERT INTO inquiries
      (id,organization_id,student_id,guardian_id,owner_admin_id,source,status)
    VALUES
      ('inquiry_1','org_1','student_1','guardian_1','admin_1','web','trial_scheduled'),
      ('inquiry_2','org_1','student_2',NULL,'admin_1','web','trial_scheduled');
    INSERT INTO trial_bookings (id,inquiry_id,lesson_session_id)
    VALUES
      ('booking_1','inquiry_1','session_trial'),
      ('booking_2','inquiry_2','session_trial');
    INSERT INTO session_participants
      (id,lesson_session_id,student_id,credit_account_id,display_name,date_of_birth,source)
    VALUES
      ('trial_participant_1','session_trial','student_1','credits_1','Student One','2014-01-01','trial'),
      ('trial_participant_2','session_trial','student_2','credits_2','Student Two','2014-02-01','trial');
  `);
  const result = db.prepare("SELECT COUNT(*) AS count FROM trial_bookings WHERE lesson_session_id='session_trial'").get() as { count: number };
  assert.equal(result.count, 2);
});

test("refund, payment, audit and payroll invariants survive hostile writes", () => {
  const db = platformDatabase();
  db.exec(`
    INSERT INTO orders
      (id,organization_id,student_id,created_by_account_id,order_type,status,
       amount_cents,credit_quantity,description,paid_at)
    VALUES ('order_1','org_1','student_1','account_1','credit_top_up','paid',12000,2,'Two credits',CURRENT_TIMESTAMP);
    INSERT INTO refunds
      (id,order_id,requested_by_id,status,amount_cents,reason)
    VALUES ('refund_1','order_1','admin_1','requested',12000,'Requested');
    INSERT INTO payment_transactions
      (id,order_id,provider,provider_event_id,transaction_type,status,amount_cents)
    VALUES ('payment_1','order_1','sandbox','event_1','payment','succeeded',12000);
    INSERT INTO audit_events
      (id,actor_id,action,entity_type,entity_id,metadata_json)
    VALUES ('audit_1','admin_1','order.paid','order','order_1','{}');
  `);
  assert.throws(
    () => db.exec(`INSERT INTO refunds
      (id,order_id,requested_by_id,status,amount_cents,reason)
      VALUES ('refund_2','order_1','admin_1','requested',12000,'Duplicate')`),
    /UNIQUE constraint failed/,
  );
  assert.throws(() => db.exec("UPDATE payment_transactions SET amount_cents=1 WHERE id='payment_1'"), /PAYMENT_LEDGER_IMMUTABLE/);
  assert.throws(() => db.exec("DELETE FROM audit_events WHERE id='audit_1'"), /AUDIT_EVENT_IMMUTABLE/);
  assert.throws(
    () => db.exec(`INSERT INTO payment_transactions
      (id,order_id,provider,provider_event_id,transaction_type,status,amount_cents)
      VALUES ('bad_payment','order_1','sandbox','event_bad','payment','mystery',1)`),
    /ck_payment_transactions_status/,
  );
});

test("paid payroll is immutable", () => {
  const db = platformDatabase();
  db.exec(`
    INSERT INTO payroll_periods
      (id,organization_id,starts_on,ends_on,status,paid_at)
    VALUES ('period_1','org_1','2026-10-01','2026-10-31','paid',CURRENT_TIMESTAMP);
    INSERT INTO payroll_entries
      (id,payroll_period_id,lesson_session_id,teacher_id,session_kind,minutes,
       base_amount_cents,status)
    VALUES ('entry_1','period_1','session_a','teacher_1','regular',60,6500,'paid');
  `);
  assert.throws(
    () => db.exec("UPDATE payroll_entries SET base_amount_cents=1 WHERE id='entry_1'"),
    /PAID_PAYROLL_IMMUTABLE/,
  );
  assert.throws(
    () => db.exec("DELETE FROM payroll_entries WHERE id='entry_1'"),
    /PAID_PAYROLL_IMMUTABLE/,
  );
});

test("state machines and overlapping effective periods are database-enforced", () => {
  const db = platformDatabase();
  db.exec(`
    INSERT INTO teacher_pay_rates
      (id,teacher_id,session_kind,amount_cents,starts_on,ends_on)
    VALUES ('rate_1','teacher_1','regular',6500,'2026-01-01','2026-12-31');
    INSERT INTO payroll_periods
      (id,organization_id,starts_on,ends_on,status)
    VALUES ('period_1','org_1','2026-10-01','2026-10-31','open');
    INSERT INTO orders
      (id,organization_id,student_id,order_type,status,amount_cents,
       credit_quantity,description)
    VALUES ('order_1','org_1','student_1','credit_top_up','pending',12000,2,'Two credits');
    INSERT INTO inquiries
      (id,organization_id,student_id,owner_admin_id,source,status)
    VALUES ('inquiry_1','org_1','student_1','admin_1','web','trial_scheduled');
    INSERT INTO trial_bookings (id,inquiry_id,lesson_session_id)
    VALUES ('booking_1','inquiry_1','session_trial');
    INSERT INTO support_sessions
      (id,organization_id,system_admin_account_id,reason,scope_json,status)
    VALUES ('support_1','org_1','account_1','Investigate','{}','requested');
  `);
  assert.throws(
    () => db.exec(`INSERT INTO teacher_pay_rates
      (id,teacher_id,session_kind,amount_cents,starts_on)
      VALUES ('rate_2','teacher_1','regular',7000,'2026-06-01')`),
    /TEACHER_PAY_RATE_OVERLAP/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO payroll_periods
      (id,organization_id,starts_on,ends_on,status)
      VALUES ('period_2','org_1','2026-10-15','2026-11-15','open')`),
    /PAYROLL_PERIOD_OVERLAP/,
  );
  assert.throws(
    () => db.exec("UPDATE payroll_periods SET status='paid' WHERE id='period_1'"),
    /INVALID_PAYROLL_TRANSITION/,
  );
  assert.throws(
    () => db.exec("UPDATE orders SET status='refunded' WHERE id='order_1'"),
    /(INVALID_ORDER_TRANSITION|PAID_ORDER_REQUIRES_TIMESTAMP)/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO trial_bookings (id,inquiry_id,lesson_session_id)
      VALUES ('booking_2','inquiry_1','session_trial')`),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO support_sessions
      (id,organization_id,system_admin_account_id,reason,scope_json,status)
      VALUES ('support_2','org_1','account_1','Duplicate','{}','active')`),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () => db.exec(`INSERT INTO refunds
      (id,order_id,requested_by_id,status,amount_cents,reason)
      VALUES ('refund_too_large','order_1','admin_1','requested',13000,'Too much')`),
    /REFUND_EXCEEDS_ORDER/,
  );
});

test("FAQ interactions require either an approved answer or a real handoff task", () => {
  const db = platformDatabase();
  db.exec(`
    INSERT INTO follow_up_tasks
      (id,organization_id,student_id,assignee_id,task_type,status,due_at)
    VALUES ('faq_task','org_1','student_1','admin_1','general','open',CURRENT_TIMESTAMP);
    INSERT INTO faq_interactions
      (id,organization_id,account_id,student_id,question_text,faq_id,
       category,resolution,source,answer_text)
    VALUES ('faq_answer','org_1','account_1','student_1','How are credits charged?',
            'faq_credit_charge','credits','answered','fallback','Approved answer');
    INSERT INTO faq_interactions
      (id,organization_id,account_id,student_id,question_text,category,
       resolution,source,handoff_task_id)
    VALUES ('faq_handoff','org_1','account_1','student_1','Please refund me',
            'payment','handoff','policy','faq_task');
  `);
  assert.throws(
    () => db.exec(`INSERT INTO faq_interactions
      (id,organization_id,account_id,student_id,question_text,category,
       resolution,source)
      VALUES ('faq_invalid','org_1','account_1','student_1','Unknown',
              'other','answered','fallback')`),
    /ck_faq_interactions_answer_shape/,
  );
});
