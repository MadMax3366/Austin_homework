import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const staffUsers = sqliteTable(
  "staff_users",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["teacher", "admin", "manager"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_staff_users_auth_user_id").on(table.authUserId),
    check("ck_staff_users_role", sql`${table.role} IN ('teacher', 'admin', 'manager')`),
  ],
);

export const students = sqliteTable(
  "students",
  {
    id: text("id").primaryKey(),
    legalName: text("legal_name").notNull(),
    preferredName: text("preferred_name"),
    dateOfBirth: text("date_of_birth").notNull(),
    lifecycleStatus: text("lifecycle_status", {
      enum: ["prospect", "active", "paused", "inactive"],
    }).notNull(),
    ownerAdminId: text("owner_admin_id").references(() => staffUsers.id),
    ...timestamps,
  },
  (table) => [
    index("idx_students_owner_status").on(table.ownerAdminId, table.lifecycleStatus),
    check(
      "ck_students_lifecycle_status",
      sql`${table.lifecycleStatus} IN ('prospect', 'active', 'paused', 'inactive')`,
    ),
  ],
);

export const guardians = sqliteTable("guardians", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  ...timestamps,
});

export const studentGuardians = sqliteTable(
  "student_guardians",
  {
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    guardianId: text("guardian_id")
      .notNull()
      .references(() => guardians.id),
    relationship: text("relationship").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("uq_student_guardians_pair").on(table.studentId, table.guardianId),
    index("idx_student_guardians_guardian").on(table.guardianId),
  ],
);

export const classSeries = sqliteTable(
  "class_series",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    room: text("room").notNull(),
    weekday: integer("weekday").notNull(),
    localStartTime: text("local_start_time").notNull(),
    localEndTime: text("local_end_time").notNull(),
    timezone: text("timezone").notNull().default("Australia/Melbourne"),
    defaultTeacherId: text("default_teacher_id")
      .notNull()
      .references(() => staffUsers.id),
    capacity: integer("capacity").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("idx_class_series_teacher_weekday").on(
      table.defaultTeacherId,
      table.weekday,
    ),
    check("ck_class_series_weekday", sql`${table.weekday} BETWEEN 0 AND 6`),
    check("ck_class_series_capacity", sql`${table.capacity} > 0`),
  ],
);

export const lessonSessions = sqliteTable(
  "lesson_sessions",
  {
    id: text("id").primaryKey(),
    classSeriesId: text("class_series_id")
      .notNull()
      .references(() => classSeries.id),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => staffUsers.id),
    sessionDate: text("session_date").notNull(),
    localStartTime: text("local_start_time").notNull(),
    localEndTime: text("local_end_time").notNull(),
    timezone: text("timezone").notNull().default("Australia/Melbourne"),
    status: text("status", {
      enum: ["scheduled", "completed", "cancelled"],
    }).notNull(),
    rawClassNotes: text("raw_class_notes"),
    feedbackJson: text("feedback_json"),
    completionKey: text("completion_key"),
    completionHash: text("completion_hash"),
    completedAt: text("completed_at"),
    completedById: text("completed_by_id").references(() => staffUsers.id),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_lesson_sessions_series_date").on(
      table.classSeriesId,
      table.sessionDate,
    ),
    uniqueIndex("uq_lesson_sessions_completion_key").on(table.completionKey),
    index("idx_lesson_sessions_teacher_date").on(
      table.teacherId,
      table.sessionDate,
    ),
    check(
      "ck_lesson_sessions_status",
      sql`${table.status} IN ('scheduled', 'completed', 'cancelled')`,
    ),
    check(
      "ck_lesson_sessions_time_order",
      sql`${table.localStartTime} < ${table.localEndTime}`,
    ),
  ],
);

export const enrollments = sqliteTable(
  "enrollments",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    classSeriesId: text("class_series_id")
      .notNull()
      .references(() => classSeries.id),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on"),
    status: text("status", { enum: ["active", "ended"] }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_enrollments_student_series_start").on(
      table.studentId,
      table.classSeriesId,
      table.startsOn,
    ),
    index("idx_enrollments_series_status").on(table.classSeriesId, table.status),
    index("idx_enrollments_student_status").on(table.studentId, table.status),
    check("ck_enrollments_status", sql`${table.status} IN ('active', 'ended')`),
  ],
);

export const attendance = sqliteTable(
  "attendance",
  {
    id: text("id").primaryKey(),
    lessonSessionId: text("lesson_session_id")
      .notNull()
      .references(() => lessonSessions.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    status: text("status", {
      enum: ["present", "late", "absent"],
    }).notNull(),
    billingStatus: text("billing_status", {
      enum: ["charged", "not_charged", "pending_insufficient_credit"],
    })
      .notNull()
      .default("not_charged"),
    recordedById: text("recorded_by_id")
      .notNull()
      .references(() => staffUsers.id),
    recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_attendance_session_student").on(
      table.lessonSessionId,
      table.studentId,
    ),
    index("idx_attendance_student").on(table.studentId),
    check(
      "ck_attendance_status",
      sql`${table.status} IN ('present', 'late', 'absent')`,
    ),
    check(
      "ck_attendance_billing_status",
      sql`${table.billingStatus} IN ('charged', 'not_charged', 'pending_insufficient_credit')`,
    ),
  ],
);

export const creditAccounts = sqliteTable(
  "credit_accounts",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_credit_accounts_student").on(table.studentId),
  ],
);

export const creditTransactions = sqliteTable(
  "credit_transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => creditAccounts.id),
    kind: text("kind", {
      enum: ["purchase", "attendance", "adjustment", "reversal"],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    note: text("note"),
    createdById: text("created_by_id").references(() => staffUsers.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_credit_transactions_source").on(
      table.accountId,
      table.kind,
      table.sourceType,
      table.sourceId,
    ),
    index("idx_credit_transactions_account_created").on(
      table.accountId,
      table.createdAt,
    ),
    check("ck_credit_transactions_quantity", sql`${table.quantity} <> 0`),
    check(
      "ck_credit_transactions_kind",
      sql`${table.kind} IN ('purchase', 'attendance', 'adjustment', 'reversal')`,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => staffUsers.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_audit_events_entity_created").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);
