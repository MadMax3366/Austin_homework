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
    rosterFrozenAt: text("roster_frozen_at"),
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
    uniqueIndex("uq_enrollments_active_student_series")
      .on(table.studentId, table.classSeriesId)
      .where(sql`${table.status} = 'active'`),
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

export const sessionParticipants = sqliteTable(
  "session_participants",
  {
    id: text("id").primaryKey(),
    lessonSessionId: text("lesson_session_id")
      .notNull()
      .references(() => lessonSessions.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    enrollmentId: text("enrollment_id").references(() => enrollments.id),
    creditAccountId: text("credit_account_id")
      .notNull()
      .references(() => creditAccounts.id),
    displayName: text("display_name").notNull(),
    dateOfBirth: text("date_of_birth").notNull(),
    isNew: integer("is_new", { mode: "boolean" }).notNull().default(false),
    source: text("source", {
      enum: ["enrollment", "trial", "makeup", "manual"],
    })
      .notNull()
      .default("enrollment"),
    sortOrder: integer("sort_order").notNull().default(0),
    removedAt: text("removed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_session_participants_session_student").on(
      table.lessonSessionId,
      table.studentId,
    ),
    index("idx_session_participants_student").on(table.studentId),
    check(
      "ck_session_participants_source",
      sql`${table.source} IN ('enrollment', 'trial', 'makeup', 'manual')`,
    ),
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

export const completionClaims = sqliteTable(
  "session_completion_claims",
  {
    lessonSessionId: text("lesson_session_id")
      .primaryKey()
      .references(() => lessonSessions.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => staffUsers.id),
    expectedVersion: integer("expected_version").notNull(),
    operation: text("operation").notNull().default("complete_class"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state", { enum: ["processing", "completed"] })
      .notNull()
      .default("processing"),
    responseSchemaVersion: integer("response_schema_version").notNull().default(1),
    responseJson: text("response_json"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_completion_claims_actor_operation_idempotency").on(
      table.actorId,
      table.operation,
      table.idempotencyKey,
    ),
    check(
      "ck_completion_claims_operation",
      sql`${table.operation} = 'complete_class'`,
    ),
    check(
      "ck_completion_claims_state",
      sql`${table.state} IN ('processing', 'completed')`,
    ),
  ],
);

export const billingExceptions = sqliteTable(
  "billing_exceptions",
  {
    id: text("id").primaryKey(),
    attendanceId: text("attendance_id")
      .notNull()
      .references(() => attendance.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    accountId: text("account_id")
      .notNull()
      .references(() => creditAccounts.id),
    reason: text("reason", { enum: ["insufficient_credit"] }).notNull(),
    status: text("status", {
      enum: ["open", "resolved", "waived", "cancelled"],
    })
      .notNull()
      .default("open"),
    version: integer("version").notNull().default(1),
    resolutionNote: text("resolution_note"),
    resolutionType: text("resolution_type", {
      enum: ["charged_after_topup", "waived", "attendance_corrected"],
    }),
    resolutionTransactionId: text("resolution_transaction_id").references(
      () => creditTransactions.id,
    ),
    assignedToId: text("assigned_to_id").references(() => staffUsers.id),
    resolvedById: text("resolved_by_id").references(() => staffUsers.id),
    resolvedAt: text("resolved_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_billing_exceptions_attendance").on(table.attendanceId),
    index("idx_billing_exceptions_status_created").on(
      table.status,
      table.createdAt,
    ),
    check(
      "ck_billing_exceptions_reason",
      sql`${table.reason} = 'insufficient_credit'`,
    ),
    check(
      "ck_billing_exceptions_status",
      sql`${table.status} IN ('open', 'resolved', 'waived', 'cancelled')`,
    ),
  ],
);

export const billingExceptionClaims = sqliteTable(
  "billing_exception_resolution_claims",
  {
    billingExceptionId: text("billing_exception_id")
      .primaryKey()
      .references(() => billingExceptions.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => staffUsers.id),
    expectedVersion: integer("expected_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    action: text("action", { enum: ["charge", "waive"] }).notNull(),
    state: text("state", { enum: ["processing", "completed"] })
      .notNull()
      .default("processing"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("uq_billing_resolution_actor_idempotency").on(
      table.actorId,
      table.idempotencyKey,
    ),
    check(
      "ck_billing_resolution_action",
      sql`${table.action} IN ('charge', 'waive')`,
    ),
    check(
      "ck_billing_resolution_state",
      sql`${table.state} IN ('processing', 'completed')`,
    ),
  ],
);

export const aiGenerations = sqliteTable(
  "ai_generations",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => staffUsers.id),
    lessonSessionId: text("lesson_session_id")
      .notNull()
      .references(() => lessonSessions.id),
    inputHash: text("input_hash").notNull(),
    source: text("source", { enum: ["ai", "fallback"] }).notNull(),
    status: text("status", { enum: ["succeeded", "fallback"] }).notNull(),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_ai_generations_actor_created").on(
      table.actorId,
      table.createdAt,
    ),
    check("ck_ai_generations_source", sql`${table.source} IN ('ai', 'fallback')`),
    check(
      "ck_ai_generations_status",
      sql`${table.status} IN ('succeeded', 'fallback')`,
    ),
  ],
);

export const aiRateLimitBuckets = sqliteTable(
  "ai_rate_limit_buckets",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: ["teacher_minute", "session_day"] }).notNull(),
    subjectId: text("subject_id").notNull(),
    bucketStart: text("bucket_start").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_ai_rate_limit_scope_subject_bucket").on(
      table.scope,
      table.subjectId,
      table.bucketStart,
    ),
    check(
      "ck_ai_rate_limit_scope",
      sql`${table.scope} IN ('teacher_minute', 'session_day')`,
    ),
    check("ck_ai_rate_limit_count", sql`${table.requestCount} > 0`),
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
