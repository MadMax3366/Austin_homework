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
    sessionKind: text("session_kind", {
      enum: ["regular", "trial", "makeup", "private"],
    })
      .notNull()
      .default("regular"),
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
    check(
      "ck_class_series_session_kind",
      sql`${table.sessionKind} IN ('regular', 'trial', 'makeup', 'private')`,
    ),
    check("ck_class_series_active", sql`${table.active} IN (0, 1)`),
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
    sessionKind: text("session_kind", {
      enum: ["regular", "trial", "makeup", "private"],
    })
      .notNull()
      .default("regular"),
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
    index("idx_lesson_sessions_date_status_time").on(
      table.sessionDate,
      table.status,
      table.localStartTime,
    ),
    check(
      "ck_lesson_sessions_status",
      sql`${table.status} IN ('scheduled', 'completed', 'cancelled')`,
    ),
    check(
      "ck_lesson_sessions_time_order",
      sql`${table.localStartTime} < ${table.localEndTime}`,
    ),
    check(
      "ck_lesson_sessions_session_kind",
      sql`${table.sessionKind} IN ('regular', 'trial', 'makeup', 'private')`,
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

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Australia/Melbourne"),
    status: text("status", { enum: ["active", "suspended"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (table) => [
    check("ck_organizations_status", sql`${table.status} IN ('active','suspended')`),
  ],
);

export const userAccounts = sqliteTable(
  "user_accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    authUserId: text("auth_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_user_accounts_auth_user_id").on(table.authUserId),
    index("idx_user_accounts_organization_status").on(
      table.organizationId,
      table.status,
    ),
    check("ck_user_accounts_status", sql`${table.status} IN ('active','disabled')`),
  ],
);

export const accountCredentials = sqliteTable(
  "account_credentials",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => userAccounts.id),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    iterations: integer("iterations").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    passwordUpdatedAt: text("password_updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "ck_account_credentials_iterations",
      sql`${table.iterations} BETWEEN 100000 AND 1000000`,
    ),
    check(
      "ck_account_credentials_failed_attempts",
      sql`${table.failedAttempts} BETWEEN 0 AND 20`,
    ),
  ],
);

export const accountSessions = sqliteTable(
  "account_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userAccounts.id),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    lastSeenAt: text("last_seen_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_account_sessions_account_expiry").on(
      table.accountId,
      table.expiresAt,
    ),
  ],
);

export const accountRoleAssignments = sqliteTable(
  "account_role_assignments",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userAccounts.id),
    role: text("role", {
      enum: [
        "teacher",
        "operations_admin",
        "manager_admin",
        "student",
        "guardian",
        "system_admin",
      ],
    }).notNull(),
    staffUserId: text("staff_user_id").references(() => staffUsers.id),
    studentId: text("student_id").references(() => students.id),
    guardianId: text("guardian_id").references(() => guardians.id),
    scopeType: text("scope_type", {
      enum: ["organization", "owner", "self"],
    })
      .notNull()
      .default("organization"),
    scopeId: text("scope_id"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_account_role_assignments_account_role").on(
      table.accountId,
      table.role,
    ),
    index("idx_account_role_assignments_role_active").on(
      table.role,
      table.active,
    ),
    check(
      "ck_account_role_assignments_role",
      sql`${table.role} IN ('teacher','operations_admin','manager_admin','student','guardian','system_admin')`,
    ),
    check(
      "ck_account_role_assignments_scope",
      sql`${table.scopeType} IN ('organization','owner','self')`,
    ),
    check("ck_account_role_assignments_active", sql`${table.active} IN (0,1)`),
    check(
      "ck_account_role_assignments_subject",
      sql`(
        (${table.role} IN ('teacher','operations_admin','manager_admin')
          AND ${table.staffUserId} IS NOT NULL
          AND ${table.studentId} IS NULL AND ${table.guardianId} IS NULL)
        OR (${table.role} = 'student' AND ${table.studentId} IS NOT NULL
          AND ${table.staffUserId} IS NULL AND ${table.guardianId} IS NULL)
        OR (${table.role} = 'guardian' AND ${table.guardianId} IS NOT NULL
          AND ${table.staffUserId} IS NULL AND ${table.studentId} IS NULL)
        OR (${table.role} = 'system_admin' AND ${table.studentId} IS NULL
          AND ${table.guardianId} IS NULL)
      )`,
    ),
  ],
);

export const organizationSettings = sqliteTable(
  "organization_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    settingKey: text("setting_key").notNull(),
    valueJson: text("value_json").notNull(),
    updatedById: text("updated_by_id").references(() => staffUsers.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_organization_settings_key").on(
      table.organizationId,
      table.settingKey,
    ),
    check("ck_organization_settings_json", sql`json_valid(${table.valueJson})`),
  ],
);

export const programs = sqliteTable(
  "programs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    defaultSessionMinutes: integer("default_session_minutes").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("idx_programs_organization_active").on(
      table.organizationId,
      table.active,
    ),
    check(
      "ck_programs_session_minutes",
      sql`${table.defaultSessionMinutes} > 0`,
    ),
    check("ck_programs_active", sql`${table.active} IN (0,1)`),
  ],
);

export const classSeriesPrograms = sqliteTable(
  "class_series_programs",
  {
    classSeriesId: text("class_series_id")
      .primaryKey()
      .references(() => classSeries.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
  },
  (table) => [index("idx_class_series_programs_program").on(table.programId)],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_rooms_organization_name").on(
      table.organizationId,
      table.name,
    ),
    check("ck_rooms_capacity", sql`${table.capacity} > 0`),
    check("ck_rooms_active", sql`${table.active} IN (0,1)`),
  ],
);

export const inquiries = sqliteTable(
  "inquiries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    guardianId: text("guardian_id").references(() => guardians.id),
    ownerAdminId: text("owner_admin_id")
      .notNull()
      .references(() => staffUsers.id),
    source: text("source").notNull(),
    status: text("status", {
      enum: [
        "new",
        "contacted",
        "trial_scheduled",
        "trial_completed",
        "won",
        "lost",
      ],
    })
      .notNull()
      .default("new"),
    notes: text("notes"),
    nextFollowUpAt: text("next_follow_up_at"),
    lostReason: text("lost_reason"),
    ...timestamps,
  },
  (table) => [
    index("idx_inquiries_owner_status_followup").on(
      table.ownerAdminId,
      table.status,
      table.nextFollowUpAt,
    ),
    index("idx_inquiries_student").on(table.studentId),
    index("idx_inquiries_organization_status_followup").on(
      table.organizationId,
      table.status,
      table.nextFollowUpAt,
    ),
    check(
      "ck_inquiries_status",
      sql`${table.status} IN ('new','contacted','trial_scheduled','trial_completed','won','lost')`,
    ),
  ],
);

export const trialBookings = sqliteTable(
  "trial_bookings",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => inquiries.id),
    lessonSessionId: text("lesson_session_id")
      .notNull()
      .references(() => lessonSessions.id),
    outcome: text("outcome", {
      enum: ["pending", "attended", "no_show", "cancelled"],
    })
      .notNull()
      .default("pending"),
    conversionDecision: text("conversion_decision", {
      enum: ["pending", "enrol", "follow_up", "not_fit"],
    })
      .notNull()
      .default("pending"),
    rawNotes: text("raw_notes"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_trial_bookings_inquiry_session").on(
      table.inquiryId,
      table.lessonSessionId,
    ),
    uniqueIndex("uq_trial_bookings_pending_inquiry")
      .on(table.inquiryId)
      .where(sql`${table.outcome} = 'pending'`),
    index("idx_trial_bookings_session").on(table.lessonSessionId),
    check(
      "ck_trial_bookings_outcome",
      sql`${table.outcome} IN ('pending','attended','no_show','cancelled')`,
    ),
    check(
      "ck_trial_bookings_conversion",
      sql`${table.conversionDecision} IN ('pending','enrol','follow_up','not_fit')`,
    ),
  ],
);

export const followUpTasks = sqliteTable(
  "follow_up_tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    studentId: text("student_id").references(() => students.id),
    inquiryId: text("inquiry_id").references(() => inquiries.id),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => staffUsers.id),
    taskType: text("task_type", {
      enum: ["trial_follow_up", "renewal", "billing_exception", "general"],
    }).notNull(),
    status: text("status", {
      enum: ["open", "completed", "cancelled"],
    })
      .notNull()
      .default("open"),
    dueAt: text("due_at").notNull(),
    completionNote: text("completion_note"),
    completedAt: text("completed_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_follow_up_tasks_assignee_status_due").on(
      table.assigneeId,
      table.status,
      table.dueAt,
    ),
    index("idx_follow_up_tasks_organization_status_due").on(
      table.organizationId,
      table.status,
      table.dueAt,
    ),
    check(
      "ck_follow_up_tasks_type",
      sql`${table.taskType} IN ('trial_follow_up','renewal','billing_exception','general')`,
    ),
    check(
      "ck_follow_up_tasks_status",
      sql`${table.status} IN ('open','completed','cancelled')`,
    ),
  ],
);

export const faqInteractions = sqliteTable(
  "faq_interactions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => userAccounts.id),
    studentId: text("student_id").references(() => students.id),
    questionText: text("question_text").notNull(),
    faqId: text("faq_id"),
    category: text("category", {
      enum: ["schedule", "trial", "credits", "attendance", "feedback", "payment", "account", "other"],
    }).notNull(),
    resolution: text("resolution", {
      enum: ["answered", "handoff"],
    }).notNull(),
    source: text("source", {
      enum: ["ai", "fallback", "policy"],
    }).notNull(),
    answerText: text("answer_text"),
    handoffTaskId: text("handoff_task_id").references(() => followUpTasks.id),
    ...timestamps,
  },
  (table) => [
    index("idx_faq_interactions_account_created").on(
      table.accountId,
      table.createdAt,
    ),
    index("idx_faq_interactions_resolution_created").on(
      table.resolution,
      table.createdAt,
    ),
    check(
      "ck_faq_interactions_category",
      sql`${table.category} IN ('schedule','trial','credits','attendance','feedback','payment','account','other')`,
    ),
    check(
      "ck_faq_interactions_resolution",
      sql`${table.resolution} IN ('answered','handoff')`,
    ),
    check(
      "ck_faq_interactions_source",
      sql`${table.source} IN ('ai','fallback','policy')`,
    ),
    check(
      "ck_faq_interactions_answer_shape",
      sql`(${table.resolution}='answered' AND ${table.answerText} IS NOT NULL AND ${table.faqId} IS NOT NULL AND ${table.handoffTaskId} IS NULL)
          OR (${table.resolution}='handoff' AND ${table.answerText} IS NULL AND ${table.handoffTaskId} IS NOT NULL)`,
    ),
  ],
);

export const teacherPayRates = sqliteTable(
  "teacher_pay_rates",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => staffUsers.id),
    sessionKind: text("session_kind", {
      enum: ["regular", "trial", "makeup", "private"],
    }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on"),
    ...timestamps,
  },
  (table) => [
    index("idx_teacher_pay_rates_teacher_kind_start").on(
      table.teacherId,
      table.sessionKind,
      table.startsOn,
    ),
    check("ck_teacher_pay_rates_amount", sql`${table.amountCents} >= 0`),
    check(
      "ck_teacher_pay_rates_kind",
      sql`${table.sessionKind} IN ('regular','trial','makeup','private')`,
    ),
    check(
      "ck_teacher_pay_rates_dates",
      sql`${table.endsOn} IS NULL OR ${table.startsOn} <= ${table.endsOn}`,
    ),
  ],
);

export const payrollPeriods = sqliteTable(
  "payroll_periods",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    status: text("status", {
      enum: ["open", "approved", "paid"],
    })
      .notNull()
      .default("open"),
    approvedById: text("approved_by_id").references(() => staffUsers.id),
    paidAt: text("paid_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_payroll_periods_organization_dates").on(
      table.organizationId,
      table.startsOn,
      table.endsOn,
    ),
    check("ck_payroll_periods_dates", sql`${table.startsOn} <= ${table.endsOn}`),
    check(
      "ck_payroll_periods_status",
      sql`${table.status} IN ('open','approved','paid')`,
    ),
  ],
);

export const payrollEntries = sqliteTable(
  "payroll_entries",
  {
    id: text("id").primaryKey(),
    payrollPeriodId: text("payroll_period_id").references(
      () => payrollPeriods.id,
    ),
    lessonSessionId: text("lesson_session_id")
      .notNull()
      .references(() => lessonSessions.id),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => staffUsers.id),
    sessionKind: text("session_kind").notNull(),
    minutes: integer("minutes").notNull(),
    baseAmountCents: integer("base_amount_cents").notNull(),
    adjustmentCents: integer("adjustment_cents").notNull().default(0),
    status: text("status", {
      enum: ["accrued", "approved", "paid", "void"],
    })
      .notNull()
      .default("accrued"),
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_payroll_entries_session").on(table.lessonSessionId),
    index("idx_payroll_entries_teacher_status").on(
      table.teacherId,
      table.status,
    ),
    index("idx_payroll_entries_period_status").on(
      table.payrollPeriodId,
      table.status,
    ),
    check("ck_payroll_entries_minutes", sql`${table.minutes} > 0`),
    check(
      "ck_payroll_entries_base_amount",
      sql`${table.baseAmountCents} >= 0`,
    ),
    check(
      "ck_payroll_entries_kind",
      sql`${table.sessionKind} IN ('regular','trial','makeup','private')`,
    ),
    check(
      "ck_payroll_entries_status",
      sql`${table.status} IN ('accrued','approved','paid','void')`,
    ),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    createdByAccountId: text("created_by_account_id").references(
      () => userAccounts.id,
    ),
    orderType: text("order_type", {
      enum: ["credit_top_up", "tuition", "other"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "paid", "partially_refunded", "refunded", "cancelled"],
    })
      .notNull()
      .default("pending"),
    amountCents: integer("amount_cents").notNull(),
    creditQuantity: integer("credit_quantity").notNull().default(0),
    currency: text("currency").notNull().default("AUD"),
    description: text("description").notNull(),
    paidAt: text("paid_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_orders_student_status_created").on(
      table.studentId,
      table.status,
      table.createdAt,
    ),
    index("idx_orders_organization_status_created").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check("ck_orders_amount", sql`${table.amountCents} > 0`),
    check("ck_orders_credit_quantity", sql`${table.creditQuantity} >= 0`),
    check(
      "ck_orders_type",
      sql`${table.orderType} IN ('credit_top_up','tuition','other')`,
    ),
    check(
      "ck_orders_status",
      sql`${table.status} IN ('pending','paid','partially_refunded','refunded','cancelled')`,
    ),
  ],
);

export const paymentTransactions = sqliteTable(
  "payment_transactions",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    transactionType: text("transaction_type", {
      enum: ["payment", "refund"],
    }).notNull(),
    status: text("status", {
      enum: ["succeeded", "failed", "pending"],
    }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    rawReference: text("raw_reference"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_payment_transactions_provider_event").on(
      table.provider,
      table.providerEventId,
    ),
    index("idx_payment_transactions_order").on(table.orderId),
    check("ck_payment_transactions_amount", sql`${table.amountCents} > 0`),
    check(
      "ck_payment_transactions_type",
      sql`${table.transactionType} IN ('payment','refund')`,
    ),
    check(
      "ck_payment_transactions_status",
      sql`${table.status} IN ('succeeded','failed','pending')`,
    ),
  ],
);

export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => staffUsers.id),
    approvedById: text("approved_by_id").references(() => staffUsers.id),
    status: text("status", {
      enum: ["requested", "approved", "completed", "rejected"],
    })
      .notNull()
      .default("requested"),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    completedAt: text("completed_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_refunds_order_status").on(table.orderId, table.status),
    uniqueIndex("uq_refunds_open_order")
      .on(table.orderId)
      .where(sql`${table.status} IN ('requested','approved','completed')`),
    check("ck_refunds_amount", sql`${table.amountCents} > 0`),
    check(
      "ck_refunds_status",
      sql`${table.status} IN ('requested','approved','completed','rejected')`,
    ),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    studentId: text("student_id").references(() => students.id),
    guardianId: text("guardian_id").references(() => guardians.id),
    createdById: text("created_by_id").references(() => staffUsers.id),
    channel: text("channel", {
      enum: ["in_app", "email", "sms", "wechat"],
    }).notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["draft", "queued", "sent", "failed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    sentAt: text("sent_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_messages_student_status").on(table.studentId, table.status),
    index("idx_messages_guardian_status").on(table.guardianId, table.status),
    index("idx_messages_organization_status_created").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check(
      "ck_messages_channel",
      sql`${table.channel} IN ('in_app','email','sms','wechat')`,
    ),
    check(
      "ck_messages_status",
      sql`${table.status} IN ('draft','queued','sent','failed','cancelled')`,
    ),
  ],
);

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    dedupeKey: text("dedupe_key"),
    payloadJson: text("payload_json").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at"),
    lastError: text("last_error"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_outbox_events_dedupe_key").on(table.dedupeKey),
    index("idx_outbox_events_status_next_attempt").on(
      table.status,
      table.nextAttemptAt,
    ),
    check("ck_outbox_events_attempts", sql`${table.attempts} >= 0`),
    check("ck_outbox_events_payload", sql`json_valid(${table.payloadJson})`),
    check(
      "ck_outbox_events_status",
      sql`${table.status} IN ('pending','processing','completed','failed')`,
    ),
  ],
);

export const integrationConfigs = sqliteTable(
  "integration_configs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    integrationType: text("integration_type", {
      enum: ["identity", "llm", "payment", "bank", "email", "sms", "wechat"],
    }).notNull(),
    providerName: text("provider_name").notNull(),
    mode: text("mode", { enum: ["disabled", "sandbox", "live"] })
      .notNull()
      .default("disabled"),
    publicConfigJson: text("public_config_json").notNull().default("{}"),
    status: text("status", { enum: ["healthy", "degraded", "unknown"] })
      .notNull()
      .default("unknown"),
    lastCheckedAt: text("last_checked_at"),
    updatedById: text("updated_by_id").references(() => staffUsers.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_integration_configs_type").on(
      table.organizationId,
      table.integrationType,
    ),
    check(
      "ck_integration_configs_type",
      sql`${table.integrationType} IN ('identity','llm','payment','bank','email','sms','wechat')`,
    ),
    check("ck_integration_configs_mode", sql`${table.mode} IN ('disabled','sandbox','live')`),
    check("ck_integration_configs_status", sql`${table.status} IN ('healthy','degraded','unknown')`),
    check("ck_integration_configs_json", sql`json_valid(${table.publicConfigJson})`),
  ],
);

export const supportSessions = sqliteTable(
  "support_sessions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    systemAdminAccountId: text("system_admin_account_id")
      .notNull()
      .references(() => userAccounts.id),
    approvedById: text("approved_by_id").references(() => staffUsers.id),
    reason: text("reason").notNull(),
    scopeJson: text("scope_json").notNull(),
    status: text("status", {
      enum: ["requested", "active", "expired", "revoked"],
    })
      .notNull()
      .default("requested"),
    startsAt: text("starts_at"),
    expiresAt: text("expires_at"),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_support_sessions_admin_status").on(
      table.systemAdminAccountId,
      table.status,
    ),
    uniqueIndex("uq_support_sessions_open_admin")
      .on(table.systemAdminAccountId)
      .where(sql`${table.status} IN ('requested','active')`),
    index("idx_support_sessions_organization_status_expiry").on(
      table.organizationId,
      table.status,
      table.expiresAt,
    ),
    check("ck_support_sessions_scope", sql`json_valid(${table.scopeJson})`),
    check(
      "ck_support_sessions_status",
      sql`${table.status} IN ('requested','active','expired','revoked')`,
    ),
    check(
      "ck_support_sessions_times",
      sql`${table.expiresAt} IS NULL OR ${table.startsAt} IS NULL OR datetime(${table.startsAt}) < datetime(${table.expiresAt})`,
    ),
  ],
);

export const systemJobs = sqliteTable(
  "system_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    jobType: text("job_type").notNull(),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed"],
    })
      .notNull()
      .default("queued"),
    payloadJson: text("payload_json").notNull().default("{}"),
    attempts: integer("attempts").notNull().default(0),
    requestedByAccountId: text("requested_by_account_id").references(
      () => userAccounts.id,
    ),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_system_jobs_status_created").on(table.status, table.createdAt),
    index("idx_system_jobs_organization_status_created").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check("ck_system_jobs_attempts", sql`${table.attempts} >= 0`),
    check("ck_system_jobs_payload", sql`json_valid(${table.payloadJson})`),
    check(
      "ck_system_jobs_status",
      sql`${table.status} IN ('queued','running','succeeded','failed')`,
    ),
  ],
);
