import "server-only";

import { getD1 } from "@/db";
import type {
  PlatformAccount,
  PlatformRole,
  RoleAssignment,
} from "@/lib/account-auth";
import {
  AppError,
  melbourneDate,
  type PlatformCommandInput,
} from "@/lib/domain";

export type CommandContext = {
  account: PlatformAccount;
  assignment: RoleAssignment;
  role: PlatformRole;
};

export type PlatformCommandResult = {
  action: PlatformCommandInput["action"];
  message: string;
  entityId?: string;
  idempotentReplay?: boolean;
  details?: Record<string, string | number | boolean | null>;
};

type InquiryRow = {
  id: string;
  studentId: string;
  guardianId: string | null;
  ownerAdminId: string;
  status: string;
};

type OrderRow = {
  id: string;
  studentId: string;
  status: string;
  amountCents: number;
  creditQuantity: number;
};

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function allow(context: CommandContext, roles: PlatformRole[]): void {
  if (!roles.includes(context.role)) {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "Your active workspace cannot perform this operation.",
    );
  }
}

function requireStaffId(context: CommandContext): string {
  if (!context.assignment.staffUserId) {
    throw new AppError(
      403,
      "STAFF_CONTEXT_REQUIRED",
      "This operation requires a linked staff profile.",
    );
  }
  return context.assignment.staffUserId;
}

async function assertStudentAccess(
  context: CommandContext,
  studentId: string,
): Promise<void> {
  if (
    context.role === "operations_admin" &&
    context.assignment.scopeType === "owner"
  ) {
    const owned = context.assignment.staffUserId
      ? await getD1().prepare(
          `SELECT 1 AS allowed FROM students
           WHERE id=? AND owner_admin_id=? LIMIT 1`,
        ).bind(studentId, context.assignment.staffUserId).first<{ allowed: number }>()
      : null;
    if (!owned) {
      throw new AppError(
        403,
        "STUDENT_SCOPE_FORBIDDEN",
        "This student belongs to another operator.",
      );
    }
  }
  if (context.role === "student" && context.assignment.studentId !== studentId) {
    throw new AppError(
      403,
      "STUDENT_SCOPE_FORBIDDEN",
      "This portal account can only act for its linked student.",
    );
  }
  if (context.role === "guardian") {
    const guardianId = context.assignment.guardianId;
    const linked = guardianId
      ? await getD1().prepare(
          `SELECT 1 AS allowed FROM student_guardians
           WHERE guardian_id=? AND student_id=? LIMIT 1`,
        ).bind(guardianId, studentId).first<{ allowed: number }>()
      : null;
    if (!linked) {
      throw new AppError(
        403,
        "STUDENT_SCOPE_FORBIDDEN",
        "This student is not linked to the guardian account.",
      );
    }
  }
}

function auditStatement(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
  auditId = makeId("audit"),
): D1PreparedStatement {
  return getD1()
    .prepare(
      `INSERT INTO audit_events
        (id, actor_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      auditId,
      actorId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    );
}

async function createInquiry(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "create_inquiry" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  const db = getD1();
  const duplicate = await db
    .prepare(
      `SELECT inquiry.id
       FROM inquiries inquiry
       JOIN students student ON student.id=inquiry.student_id
       LEFT JOIN guardians guardian ON guardian.id=inquiry.guardian_id
       WHERE student.date_of_birth=?
         AND lower(COALESCE(student.preferred_name,student.legal_name))=lower(?)
         AND lower(COALESCE(guardian.email,''))=lower(?)
         AND inquiry.status NOT IN ('won','lost')
       LIMIT 1`,
    )
    .bind(input.birthDate, input.studentName, input.guardianEmail)
    .first<{ id: string }>();
  if (duplicate) {
    throw new AppError(
      409,
      "DUPLICATE_ACTIVE_INQUIRY",
      "An active inquiry already exists for this student and guardian.",
      { inquiryId: duplicate.id },
    );
  }

  const inquiryId = makeId("inquiry");
  const studentId = makeId("student");
  const guardianId = makeId("guardian");
  const creditAccountId = makeId("credits");
  const taskId = makeId("followup");
  await db.batch([
    db.prepare(
      `INSERT INTO students
        (id,legal_name,preferred_name,date_of_birth,lifecycle_status,owner_admin_id)
       VALUES (?,?,?,?, 'prospect',?)`,
    ).bind(studentId, input.studentName, input.studentName, input.birthDate, actorId),
    db.prepare(
      `INSERT INTO guardians (id,full_name,email,phone) VALUES (?,?,?,?)`,
    ).bind(guardianId, input.guardianName, input.guardianEmail, input.guardianPhone),
    db.prepare(
      `INSERT INTO student_guardians
        (student_id,guardian_id,relationship,is_primary)
       VALUES (?,?,'guardian',1)`,
    ).bind(studentId, guardianId),
    db.prepare(
      `INSERT INTO credit_accounts (id,student_id) VALUES (?,?)`,
    ).bind(creditAccountId, studentId),
    db.prepare(
      `INSERT INTO inquiries
        (id,organization_id,student_id,guardian_id,owner_admin_id,source,status,notes,
         next_follow_up_at)
       VALUES (?,?,?,?,?,?,'new',?,datetime('now','+1 day'))`,
    ).bind(
      inquiryId,
      context.account.organizationId,
      studentId,
      guardianId,
      actorId,
      input.source,
      input.notes || null,
    ),
    db.prepare(
      `INSERT INTO follow_up_tasks
        (id,organization_id,student_id,inquiry_id,assignee_id,task_type,due_at)
       VALUES (?,?,?,?,?,'general',datetime('now','+1 day'))`,
    ).bind(
      taskId,
      context.account.organizationId,
      studentId,
      inquiryId,
      actorId,
    ),
    auditStatement(actorId, "inquiry.created", "inquiry", inquiryId, {
      source: input.source,
      studentId,
    }),
  ]);
  return {
    action: input.action,
    entityId: inquiryId,
    message: "咨询已创建，并自动生成首次跟进任务。",
  };
}

async function scheduleTrial(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "schedule_trial" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  if (input.startTime >= input.endTime) {
    throw new AppError(422, "INVALID_TIME_RANGE", "Trial end time must be after its start time.");
  }
  if (input.date < melbourneDate()) {
    throw new AppError(422, "TRIAL_DATE_IN_PAST", "A trial cannot be scheduled in the past.");
  }

  const db = getD1();
  const inquiry = await db.prepare(
    `SELECT id,student_id AS studentId,guardian_id AS guardianId,
            owner_admin_id AS ownerAdminId,status
     FROM inquiries WHERE id=? LIMIT 1`,
  ).bind(input.inquiryId).first<InquiryRow>();
  if (!inquiry) throw new AppError(404, "INQUIRY_NOT_FOUND", "Inquiry not found.");
  if (context.assignment.scopeType === "owner" && inquiry.ownerAdminId !== actorId) {
    throw new AppError(403, "INQUIRY_SCOPE_FORBIDDEN", "This inquiry belongs to another operator.");
  }
  if (!["new", "contacted", "trial_scheduled"].includes(inquiry.status)) {
    throw new AppError(409, "INQUIRY_STATE_CONFLICT", "This inquiry cannot schedule another trial.");
  }
  const pending = await db.prepare(
    `SELECT booking.id FROM trial_bookings booking
     JOIN lesson_sessions session ON session.id=booking.lesson_session_id
     WHERE booking.inquiry_id=? AND booking.outcome='pending'
       AND session.status='scheduled' LIMIT 1`,
  ).bind(inquiry.id).first<{ id: string }>();
  if (pending) {
    throw new AppError(409, "TRIAL_ALREADY_SCHEDULED", "This inquiry already has a pending trial.");
  }

  const teacher = await db.prepare(
    `SELECT id FROM staff_users WHERE id=? AND role='teacher' AND active=1 LIMIT 1`,
  ).bind(input.teacherId).first<{ id: string }>();
  if (!teacher) throw new AppError(422, "TEACHER_UNAVAILABLE", "The selected teacher is not active.");
  const room = await db.prepare(
    `SELECT id FROM rooms WHERE organization_id=? AND name=? AND active=1 LIMIT 1`,
  ).bind(context.account.organizationId, input.room).first<{ id: string }>();
  if (!room) throw new AppError(422, "ROOM_UNAVAILABLE", "The selected room is not active.");

  const teacherConflict = await db.prepare(
    `SELECT id FROM lesson_sessions
     WHERE teacher_id=? AND session_date=? AND status<>'cancelled'
       AND local_start_time<? AND ?<local_end_time LIMIT 1`,
  ).bind(input.teacherId, input.date, input.endTime, input.startTime).first<{ id: string }>();
  if (teacherConflict) {
    throw new AppError(409, "TEACHER_SCHEDULE_CONFLICT", "The teacher already has an overlapping class.", teacherConflict);
  }
  const roomConflict = await db.prepare(
    `SELECT session.id FROM lesson_sessions session
     JOIN class_series series ON series.id=session.class_series_id
     WHERE series.room=? AND session.session_date=? AND session.status<>'cancelled'
       AND session.local_start_time<? AND ?<session.local_end_time LIMIT 1`,
  ).bind(input.room, input.date, input.endTime, input.startTime).first<{ id: string }>();
  if (roomConflict) {
    throw new AppError(409, "ROOM_SCHEDULE_CONFLICT", "The room already has an overlapping class.", roomConflict);
  }
  const studentConflict = await db.prepare(
    `SELECT session.id FROM session_participants participant
     JOIN lesson_sessions session ON session.id=participant.lesson_session_id
     WHERE participant.student_id=? AND participant.removed_at IS NULL
       AND session.session_date=? AND session.status<>'cancelled'
       AND session.local_start_time<? AND ?<session.local_end_time LIMIT 1`,
  ).bind(inquiry.studentId, input.date, input.endTime, input.startTime).first<{ id: string }>();
  if (studentConflict) {
    throw new AppError(409, "STUDENT_SCHEDULE_CONFLICT", "The student already has an overlapping class.", studentConflict);
  }

  const seriesId = makeId("trial_series");
  const sessionId = makeId("trial_session");
  const bookingId = makeId("trial");
  const participantId = makeId("participant");
  const dateParts = input.date.split("-").map(Number);
  const weekday = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2])).getUTCDay();
  await db.batch([
    db.prepare(
      `INSERT INTO class_series
        (id,name,subject,room,weekday,local_start_time,local_end_time,session_kind,
         default_teacher_id,capacity,active)
       VALUES (?,'Trial lesson','Trial',?,?,?,?, 'trial',?,1,0)`,
    ).bind(seriesId, input.room, weekday, input.startTime, input.endTime, input.teacherId),
    db.prepare(
      `INSERT INTO lesson_sessions
        (id,class_series_id,teacher_id,session_date,local_start_time,local_end_time,
         session_kind,status)
       VALUES (?,?,?,?,?,?,'trial','scheduled')`,
    ).bind(sessionId, seriesId, input.teacherId, input.date, input.startTime, input.endTime),
    db.prepare(
      `INSERT INTO session_participants
        (id,lesson_session_id,student_id,credit_account_id,display_name,date_of_birth,
         is_new,source,sort_order)
       SELECT ?,?,?,account_record.id,COALESCE(student.preferred_name,student.legal_name),
              student.date_of_birth,1,'trial',1
       FROM students student
       JOIN credit_accounts account_record ON account_record.student_id=student.id
       WHERE student.id=?`,
    ).bind(participantId, sessionId, inquiry.studentId, inquiry.studentId),
    db.prepare(
      `UPDATE lesson_sessions SET roster_frozen_at=CURRENT_TIMESTAMP
       WHERE id=? AND roster_frozen_at IS NULL`,
    ).bind(sessionId),
    db.prepare(
      `INSERT INTO trial_bookings (id,inquiry_id,lesson_session_id)
       VALUES (?,?,?)`,
    ).bind(bookingId, inquiry.id, sessionId),
    db.prepare(
      `UPDATE inquiries SET status='trial_scheduled',updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).bind(inquiry.id),
    auditStatement(actorId, "trial.scheduled", "trial_booking", bookingId, {
      sessionId,
      teacherId: input.teacherId,
      date: input.date,
    }),
  ]);
  return {
    action: input.action,
    entityId: bookingId,
    message: "试听已排入统一课表，并完成老师、教室和学生三类冲突校验。",
    details: { sessionId },
  };
}

async function recordTrialOutcome(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "record_trial_outcome" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["teacher", "operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  const db = getD1();
  const booking = await db.prepare(
    `SELECT booking.id,booking.outcome,inquiry.id AS inquiryId,
            inquiry.student_id AS studentId,inquiry.owner_admin_id AS ownerAdminId,
            session.id AS sessionId,session.teacher_id AS teacherId,session.status AS sessionStatus
     FROM trial_bookings booking
     JOIN inquiries inquiry ON inquiry.id=booking.inquiry_id
     JOIN lesson_sessions session ON session.id=booking.lesson_session_id
     WHERE booking.id=? LIMIT 1`,
  ).bind(input.trialBookingId).first<{
    id: string; outcome: string; inquiryId: string; studentId: string;
    ownerAdminId: string; sessionId: string; teacherId: string; sessionStatus: string;
  }>();
  if (!booking) throw new AppError(404, "TRIAL_NOT_FOUND", "Trial booking not found.");
  if (context.role === "teacher" && booking.teacherId !== actorId) {
    throw new AppError(403, "TRIAL_SCOPE_FORBIDDEN", "This trial is assigned to another teacher.");
  }
  if (context.role === "operations_admin" && context.assignment.scopeType === "owner" && booking.ownerAdminId !== actorId) {
    throw new AppError(403, "TRIAL_SCOPE_FORBIDDEN", "This trial belongs to another operator.");
  }
  if (booking.outcome !== "pending") {
    throw new AppError(409, "TRIAL_ALREADY_RECORDED", "This trial outcome has already been recorded.");
  }
  if (
    (input.outcome === "attended" || input.outcome === "no_show") &&
    booking.sessionStatus !== "completed"
  ) {
    throw new AppError(
      409,
      "TRIAL_ATTENDANCE_REQUIRED",
      "Complete the trial attendance before recording an attended or no-show outcome.",
    );
  }
  if (input.outcome !== "attended" && input.decision === "enrol") {
    throw new AppError(
      422,
      "INVALID_TRIAL_DECISION",
      "A cancelled or no-show trial cannot be converted directly to enrolment.",
    );
  }
  if (input.outcome === "attended" && input.decision === "not_fit") {
    // Valid, but deliberately explicit so the resulting lead is closed.
  }
  const nextInquiryStatus = input.decision === "not_fit" ? "lost" : "trial_completed";
  const taskId = `followup_trial_${booking.id}`;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE trial_bookings SET outcome=?,conversion_decision=?,raw_notes=?,
         updated_at=CURRENT_TIMESTAMP WHERE id=? AND outcome='pending'`,
    ).bind(input.outcome, input.decision, input.notes, booking.id),
    db.prepare(
      `UPDATE inquiries SET status=?,lost_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(nextInquiryStatus, input.decision === "not_fit" ? input.notes : null, booking.inquiryId),
  ];
  if (booking.sessionStatus === "scheduled" && input.outcome === "cancelled") {
    statements.push(db.prepare(
      `UPDATE lesson_sessions SET status='cancelled',version=version+1,
         updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='scheduled'`,
    ).bind(booking.sessionId));
  }
  if (input.decision === "follow_up" || input.decision === "enrol") {
    statements.push(db.prepare(
      `INSERT INTO follow_up_tasks
        (id,organization_id,student_id,inquiry_id,assignee_id,task_type,due_at)
       SELECT ?,organization_id,student_id,id,owner_admin_id,'trial_follow_up',
              datetime('now','+1 day') FROM inquiries WHERE id=?`,
    ).bind(taskId, booking.inquiryId));
  }
  statements.push(auditStatement(actorId, "trial.outcome_recorded", "trial_booking", booking.id, {
    outcome: input.outcome,
    decision: input.decision,
  }, `audit_trial_outcome_${booking.id}`));
  await db.batch(statements);
  return {
    action: input.action,
    entityId: booking.id,
    message: "试听结果已记录，招生阶段和后续任务已同步。",
  };
}

async function convertInquiry(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "convert_inquiry" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  const db = getD1();
  const inquiry = await db.prepare(
    `SELECT id,student_id AS studentId,guardian_id AS guardianId,
            owner_admin_id AS ownerAdminId,status
     FROM inquiries WHERE id=? LIMIT 1`,
  ).bind(input.inquiryId).first<InquiryRow>();
  if (!inquiry) throw new AppError(404, "INQUIRY_NOT_FOUND", "Inquiry not found.");
  if (inquiry.status !== "trial_completed") {
    throw new AppError(409, "TRIAL_DECISION_REQUIRED", "Record a completed trial decision before enrolment.");
  }
  const decision = await db.prepare(
    `SELECT conversion_decision AS decision FROM trial_bookings
     WHERE inquiry_id=? ORDER BY created_at DESC LIMIT 1`,
  ).bind(inquiry.id).first<{ decision: string }>();
  if (decision?.decision !== "enrol") {
    throw new AppError(409, "ENROLMENT_NOT_APPROVED", "The latest trial decision is not enrol.");
  }
  const targetClass = await db.prepare(
    `SELECT id,capacity FROM class_series WHERE id=? AND active=1 LIMIT 1`,
  ).bind(input.classSeriesId).first<{ id: string; capacity: number }>();
  if (!targetClass) throw new AppError(404, "CLASS_NOT_FOUND", "Target class not found.");
  const classCount = await db.prepare(
    `SELECT COUNT(*) AS count FROM enrollments
     WHERE class_series_id=? AND status='active'`,
  ).bind(targetClass.id).first<{ count: number }>();
  if (Number(classCount?.count ?? 0) >= Number(targetClass.capacity)) {
    throw new AppError(409, "CLASS_AT_CAPACITY", "The target class has no remaining places.");
  }
  const existing = await db.prepare(
    `SELECT id FROM enrollments WHERE student_id=? AND class_series_id=?
     AND status='active' LIMIT 1`,
  ).bind(inquiry.studentId, input.classSeriesId).first<{ id: string }>();
  if (existing) throw new AppError(409, "ALREADY_ENROLLED", "The student is already enrolled in this class.");

  const enrollmentId = makeId("enrolment");
  const orderId = makeId("order");
  await db.batch([
    db.prepare(
      `INSERT INTO enrollments (id,student_id,class_series_id,starts_on,status)
       VALUES (?,?,?,?,'active')`,
    ).bind(enrollmentId, inquiry.studentId, input.classSeriesId, melbourneDate()),
    db.prepare(
      `INSERT INTO orders
        (id,organization_id,student_id,created_by_account_id,order_type,status,
         amount_cents,credit_quantity,description)
       VALUES (?,?,?,?,'tuition','pending',?,?, 'Initial enrolment package')`,
    ).bind(
      orderId,
      context.account.organizationId,
      inquiry.studentId,
      context.account.id,
      input.amountCents,
      input.creditQuantity,
    ),
    db.prepare(
      `UPDATE students SET lifecycle_status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(inquiry.studentId),
    db.prepare(
      `UPDATE inquiries SET status='won',updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(inquiry.id),
    db.prepare(
      `UPDATE follow_up_tasks SET status='completed',completion_note='Converted to enrolment',
         completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE inquiry_id=? AND status='open'`,
    ).bind(inquiry.id),
    auditStatement(actorId, "inquiry.converted", "inquiry", inquiry.id, {
      enrollmentId,
      orderId,
    }),
  ]);
  return {
    action: input.action,
    entityId: enrollmentId,
    message: "学生已转为正式学员，并生成待支付的首期订单。",
    details: { orderId },
  };
}

async function createOrder(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "create_order" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin", "student", "guardian"]);
  await assertStudentAccess(context, input.studentId);
  const student = await getD1().prepare(
    `SELECT id FROM students WHERE id=? AND lifecycle_status IN ('active','paused') LIMIT 1`,
  ).bind(input.studentId).first<{ id: string }>();
  if (!student) throw new AppError(404, "STUDENT_NOT_FOUND", "Active student not found.");
  const orderId = makeId("order");
  await getD1().batch([
    getD1().prepare(
      `INSERT INTO orders
        (id,organization_id,student_id,created_by_account_id,order_type,status,
         amount_cents,credit_quantity,description)
       VALUES (?,?,?,?,'credit_top_up','pending',?,?,?)`,
    ).bind(
      orderId,
      context.account.organizationId,
      input.studentId,
      context.account.id,
      input.amountCents,
      input.creditQuantity,
      input.description,
    ),
    auditStatement(context.assignment.staffUserId, "order.created", "order", orderId, {
      studentId: input.studentId,
      accountId: context.account.id,
    }),
  ]);
  return { action: input.action, entityId: orderId, message: "续费订单已创建，等待支付。" };
}

async function enrollStudent(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "enroll_student" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  await assertStudentAccess(context, input.studentId);
  const actorId = requireStaffId(context);
  const db = getD1();
  const student = await db.prepare(
    `SELECT student.id,student.legal_name AS legalName,
            student.preferred_name AS preferredName,student.date_of_birth AS dateOfBirth,
            account_record.id AS creditAccountId
     FROM students student
     JOIN credit_accounts account_record ON account_record.student_id=student.id
     WHERE student.id=? AND student.lifecycle_status IN ('prospect','active','paused')
     LIMIT 1`,
  ).bind(input.studentId).first<{
    id: string; legalName: string; preferredName: string | null;
    dateOfBirth: string; creditAccountId: string;
  }>();
  if (!student) throw new AppError(404, "STUDENT_NOT_FOUND", "未找到可报名的学生。");
  const targetClass = await db.prepare(
    `SELECT id,weekday,local_start_time AS startTime,local_end_time AS endTime,
            capacity
     FROM class_series WHERE id=? AND active=1 AND session_kind='regular' LIMIT 1`,
  ).bind(input.classSeriesId).first<{
    id: string; weekday: number; startTime: string; endTime: string; capacity: number;
  }>();
  if (!targetClass) throw new AppError(404, "CLASS_NOT_FOUND", "未找到目标班级。");
  const existing = await db.prepare(
    `SELECT id FROM enrollments
     WHERE student_id=? AND class_series_id=? AND status='active' LIMIT 1`,
  ).bind(student.id, targetClass.id).first<{ id: string }>();
  if (existing) throw new AppError(409, "ALREADY_ENROLLED", "学生已在该班级中。");
  const conflict = await db.prepare(
    `SELECT series.id,series.name,series.local_start_time AS startTime,
            series.local_end_time AS endTime
     FROM enrollments enrollment
     JOIN class_series series ON series.id=enrollment.class_series_id
     WHERE enrollment.student_id=? AND enrollment.status='active'
       AND series.active=1 AND series.weekday=?
       AND series.local_start_time<? AND ?<series.local_end_time
     LIMIT 1`,
  ).bind(
    student.id,
    targetClass.weekday,
    targetClass.endTime,
    targetClass.startTime,
  ).first<Record<string, string>>();
  if (conflict) {
    throw new AppError(409, "STUDENT_SCHEDULE_CONFLICT", "学生与现有班级时间冲突。", conflict);
  }
  const classCount = await db.prepare(
    `SELECT COUNT(*) AS count FROM enrollments
     WHERE class_series_id=? AND status='active'`,
  ).bind(targetClass.id).first<{ count: number }>();
  if (Number(classCount?.count ?? 0) >= Number(targetClass.capacity)) {
    throw new AppError(409, "CLASS_AT_CAPACITY", "目标班级已满员。");
  }

  const sessions = await db.prepare(
    `SELECT id FROM lesson_sessions
     WHERE class_series_id=? AND status='scheduled'
       AND session_date>=? AND roster_frozen_at IS NULL
     ORDER BY session_date`,
  ).bind(targetClass.id, melbourneDate()).all<{ id: string }>();
  const enrollmentId = makeId("enrolment");
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO enrollments (id,student_id,class_series_id,starts_on,status)
       VALUES (?,?,?,?,'active')`,
    ).bind(enrollmentId, student.id, targetClass.id, melbourneDate()),
    db.prepare(
      `UPDATE students SET lifecycle_status='active',updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).bind(student.id),
  ];
  for (const session of sessions.results) {
    statements.push(
      db.prepare(
        `INSERT INTO session_participants
          (id,lesson_session_id,student_id,enrollment_id,credit_account_id,
           display_name,date_of_birth,is_new,source,sort_order)
         VALUES (?,?,?,?,?,?,?,0,'enrollment',999)`,
      ).bind(
        `participant_${session.id}_${student.id}`,
        session.id,
        student.id,
        enrollmentId,
        student.creditAccountId,
        student.preferredName ?? student.legalName,
        student.dateOfBirth,
      ),
    );
  }
  statements.push(
    auditStatement(actorId, "enrollment.created", "enrollment", enrollmentId, {
      studentId: student.id,
      classSeriesId: targetClass.id,
    }),
  );
  await db.batch(statements);
  return { action: input.action, entityId: enrollmentId, message: "学生已加入班级。" };
}

async function endEnrollment(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "end_enrollment" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  const enrollment = await getD1().prepare(
    `SELECT id,student_id AS studentId,class_series_id AS classSeriesId,status
     FROM enrollments WHERE id=? LIMIT 1`,
  ).bind(input.enrollmentId).first<{
    id: string; studentId: string; classSeriesId: string; status: string;
  }>();
  if (!enrollment) throw new AppError(404, "ENROLLMENT_NOT_FOUND", "未找到班级报名记录。");
  await assertStudentAccess(context, enrollment.studentId);
  if (enrollment.status !== "active") {
    throw new AppError(409, "ENROLLMENT_ALREADY_ENDED", "该班级报名已结束。");
  }
  await getD1().batch([
    getD1().prepare(
      `UPDATE enrollments SET status='ended',ends_on=?,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='active'`,
    ).bind(melbourneDate(), enrollment.id),
    getD1().prepare(
      `UPDATE session_participants SET removed_at=CURRENT_TIMESTAMP
       WHERE enrollment_id=? AND removed_at IS NULL
         AND lesson_session_id IN (
           SELECT id FROM lesson_sessions
           WHERE status='scheduled' AND session_date>=? AND roster_frozen_at IS NULL
         )`,
    ).bind(enrollment.id, melbourneDate()),
    auditStatement(actorId, "enrollment.ended", "enrollment", enrollment.id, {
      reason: input.reason,
    }),
  ]);
  return { action: input.action, entityId: enrollment.id, message: "学生已退出该班级。" };
}

async function transferStudentOwner(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "transfer_student_owner" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["manager_admin"]);
  const actorId = requireStaffId(context);
  const owner = await getD1().prepare(
    `SELECT id FROM staff_users WHERE id=? AND role='admin' AND active=1 LIMIT 1`,
  ).bind(input.newOwnerId).first<{ id: string }>();
  if (!owner) throw new AppError(422, "OWNER_UNAVAILABLE", "目标运营账号不可用。");
  const student = await getD1().prepare(
    `SELECT id,owner_admin_id AS ownerAdminId FROM students WHERE id=? LIMIT 1`,
  ).bind(input.studentId).first<{ id: string; ownerAdminId: string | null }>();
  if (!student) throw new AppError(404, "STUDENT_NOT_FOUND", "未找到该学生。");
  await getD1().batch([
    getD1().prepare(
      `UPDATE students SET owner_admin_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(owner.id, student.id),
    getD1().prepare(
      `UPDATE inquiries SET owner_admin_id=?,updated_at=CURRENT_TIMESTAMP
       WHERE student_id=? AND status NOT IN ('won','lost')`,
    ).bind(owner.id, student.id),
    getD1().prepare(
      `UPDATE follow_up_tasks SET assignee_id=?,updated_at=CURRENT_TIMESTAMP
       WHERE student_id=? AND status='open'`,
    ).bind(owner.id, student.id),
    auditStatement(actorId, "student.owner_transferred", "student", student.id, {
      fromOwnerId: student.ownerAdminId,
      toOwnerId: owner.id,
    }),
  ]);
  return { action: input.action, entityId: student.id, message: "学生负责人已更新。" };
}

async function requestTeacherLeave(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "request_teacher_leave" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["teacher", "operations_admin", "manager_admin"]);
  const linkedStaffId = requireStaffId(context);
  const teacherId = context.role === "teacher" ? linkedStaffId : input.teacherId;
  if (!teacherId) throw new AppError(422, "TEACHER_REQUIRED", "请选择老师。");
  if (context.role === "teacher" && input.teacherId && input.teacherId !== linkedStaffId) {
    throw new AppError(403, "TEACHER_SCOPE_FORBIDDEN", "教师只能提交自己的请假申请。");
  }
  if (input.startsOn < melbourneDate() || input.endsOn < input.startsOn) {
    throw new AppError(422, "LEAVE_DATE_INVALID", "请假日期无效。");
  }
  const teacher = await getD1().prepare(
    `SELECT id FROM staff_users WHERE id=? AND role='teacher' AND active=1 LIMIT 1`,
  ).bind(teacherId).first<{ id: string }>();
  if (!teacher) throw new AppError(422, "TEACHER_UNAVAILABLE", "老师账号不可用。");
  const overlap = await getD1().prepare(
    `SELECT id FROM teacher_leave_requests
     WHERE teacher_id=? AND status IN ('requested','approved')
       AND starts_on<=? AND ?<=ends_on LIMIT 1`,
  ).bind(teacherId, input.endsOn, input.startsOn).first<{ id: string }>();
  if (overlap) throw new AppError(409, "LEAVE_REQUEST_OVERLAP", "该日期已有请假申请。");
  const leaveId = makeId("leave");
  await getD1().batch([
    getD1().prepare(
      `INSERT INTO teacher_leave_requests
        (id,organization_id,teacher_id,starts_on,ends_on,reason,status,requested_by_account_id)
       VALUES (?,?,?,?,?,?,'requested',?)`,
    ).bind(
      leaveId,
      context.account.organizationId,
      teacherId,
      input.startsOn,
      input.endsOn,
      input.reason,
      context.account.id,
    ),
    auditStatement(linkedStaffId, "teacher_leave.requested", "teacher_leave", leaveId),
  ]);
  return { action: input.action, entityId: leaveId, message: "请假申请已提交。" };
}

async function decideTeacherLeave(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "decide_teacher_leave" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  const leave = await getD1().prepare(
    `SELECT id,teacher_id AS teacherId,starts_on AS startsOn,ends_on AS endsOn,status
     FROM teacher_leave_requests WHERE id=? LIMIT 1`,
  ).bind(input.leaveRequestId).first<{
    id: string; teacherId: string; startsOn: string; endsOn: string; status: string;
  }>();
  if (!leave) throw new AppError(404, "LEAVE_REQUEST_NOT_FOUND", "未找到请假申请。");
  if (leave.status !== "requested") {
    throw new AppError(409, "LEAVE_REQUEST_DECIDED", "请假申请已处理。");
  }
  const status = input.approve ? "approved" : "rejected";
  const affected = await getD1().prepare(
    `SELECT COUNT(*) AS count FROM lesson_sessions
     WHERE teacher_id=? AND status='scheduled' AND session_date BETWEEN ? AND ?`,
  ).bind(leave.teacherId, leave.startsOn, leave.endsOn).first<{ count: number }>();
  await getD1().batch([
    getD1().prepare(
      `UPDATE teacher_leave_requests
       SET status=?,decided_by_id=?,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='requested'`,
    ).bind(status, actorId, leave.id),
    auditStatement(actorId, `teacher_leave.${status}`, "teacher_leave", leave.id, {
      affectedSessions: Number(affected?.count ?? 0),
    }),
  ]);
  return {
    action: input.action,
    entityId: leave.id,
    message: input.approve ? "请假申请已批准，请安排代课。" : "请假申请已拒绝。",
    details: { affectedSessions: Number(affected?.count ?? 0) },
  };
}

async function assignSubstitute(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "assign_substitute" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  const leave = await getD1().prepare(
    `SELECT id,teacher_id AS teacherId,starts_on AS startsOn,ends_on AS endsOn,status
     FROM teacher_leave_requests WHERE id=? LIMIT 1`,
  ).bind(input.leaveRequestId).first<{
    id: string; teacherId: string; startsOn: string; endsOn: string; status: string;
  }>();
  if (!leave || leave.status !== "approved") {
    throw new AppError(409, "LEAVE_NOT_APPROVED", "请先批准请假申请。");
  }
  const session = await getD1().prepare(
    `SELECT id,teacher_id AS teacherId,session_date AS sessionDate,
            local_start_time AS startTime,local_end_time AS endTime,status
     FROM lesson_sessions WHERE id=? LIMIT 1`,
  ).bind(input.sessionId).first<{
    id: string; teacherId: string; sessionDate: string;
    startTime: string; endTime: string; status: string;
  }>();
  if (!session || session.status !== "scheduled") {
    throw new AppError(409, "SESSION_NOT_REASSIGNABLE", "该课次不能安排代课。");
  }
  if (
    session.teacherId !== leave.teacherId ||
    session.sessionDate < leave.startsOn ||
    session.sessionDate > leave.endsOn
  ) {
    throw new AppError(409, "SESSION_OUTSIDE_LEAVE", "该课次不在请假影响范围内。");
  }
  const substitute = await getD1().prepare(
    `SELECT id FROM staff_users WHERE id=? AND role='teacher' AND active=1 LIMIT 1`,
  ).bind(input.substituteTeacherId).first<{ id: string }>();
  if (!substitute || substitute.id === leave.teacherId) {
    throw new AppError(422, "SUBSTITUTE_UNAVAILABLE", "代课老师无效。");
  }
  const conflict = await getD1().prepare(
    `SELECT id FROM lesson_sessions
     WHERE teacher_id=? AND session_date=? AND status<>'cancelled' AND id<>?
       AND local_start_time<? AND ?<local_end_time LIMIT 1`,
  ).bind(
    substitute.id,
    session.sessionDate,
    session.id,
    session.endTime,
    session.startTime,
  ).first<{ id: string }>();
  if (conflict) throw new AppError(409, "TEACHER_SCHEDULE_CONFLICT", "代课老师在该时段已有课程。");
  const substitutionId = makeId("substitution");
  await getD1().batch([
    getD1().prepare(
      `INSERT INTO teacher_substitutions
        (id,leave_request_id,lesson_session_id,original_teacher_id,
         substitute_teacher_id,assigned_by_id,status,reason)
       VALUES (?,?,?,?,?,?,'assigned',?)`,
    ).bind(
      substitutionId,
      leave.id,
      session.id,
      leave.teacherId,
      substitute.id,
      actorId,
      input.reason,
    ),
    getD1().prepare(
      `UPDATE lesson_sessions SET teacher_id=?,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND teacher_id=? AND status='scheduled'`,
    ).bind(substitute.id, session.id, leave.teacherId),
    auditStatement(actorId, "teacher_substitution.assigned", "lesson_session", session.id, {
      leaveRequestId: leave.id,
      originalTeacherId: leave.teacherId,
      substituteTeacherId: substitute.id,
    }),
  ]);
  return { action: input.action, entityId: substitutionId, message: "代课老师已安排。" };
}

async function sandboxPayOrder(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "sandbox_pay_order" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin", "student", "guardian"]);
  const db = getD1();
  const replay = await db.prepare(
    `SELECT order_id AS orderId FROM payment_transactions
     WHERE provider='sandbox' AND provider_event_id=? LIMIT 1`,
  ).bind(input.providerEventId).first<{ orderId: string }>();
  if (replay) {
    if (replay.orderId !== input.orderId) {
      throw new AppError(409, "PAYMENT_EVENT_REUSED", "The payment event belongs to another order.");
    }
    return {
      action: input.action,
      entityId: input.orderId,
      message: "支付回调已处理过，没有重复增加课时。",
      idempotentReplay: true,
    };
  }
  const order = await db.prepare(
    `SELECT id,student_id AS studentId,status,amount_cents AS amountCents,
            credit_quantity AS creditQuantity
     FROM orders WHERE id=? LIMIT 1`,
  ).bind(input.orderId).first<OrderRow>();
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
  await assertStudentAccess(context, order.studentId);
  if (order.status !== "pending") {
    throw new AppError(409, "ORDER_NOT_PAYABLE", "Only a pending order can be paid.");
  }
  const paymentId = makeId("payment");
  const creditTransactionId = `credit_order_${order.id}`;
  const outboxId = makeId("outbox");
  try {
    await db.batch([
      db.prepare(
      `INSERT INTO payment_transactions
        (id,order_id,provider,provider_event_id,transaction_type,status,amount_cents)
       VALUES (?,?,'sandbox',?,'payment','succeeded',?)`,
    ).bind(paymentId, order.id, input.providerEventId, order.amountCents),
    db.prepare(
      `UPDATE orders SET status='paid',paid_at=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`,
    ).bind(order.id),
    db.prepare(
      `INSERT INTO credit_transactions
        (id,account_id,kind,quantity,source_type,source_id,note,created_by_id)
       SELECT ?,account_record.id,'purchase',?,'order',?,'Paid lesson-credit order',?
       FROM credit_accounts account_record WHERE account_record.student_id=?`,
    ).bind(
      creditTransactionId,
      order.creditQuantity,
      order.id,
      context.assignment.staffUserId,
      order.studentId,
    ),
    db.prepare(
      `INSERT INTO outbox_events
        (id,organization_id,event_type,aggregate_type,aggregate_id,dedupe_key,payload_json)
       VALUES (?,?,'payment.succeeded','order',?,?,?)`,
    ).bind(
      outboxId,
      context.account.organizationId,
      order.id,
      `payment.succeeded:${order.id}`,
      JSON.stringify({ orderId: order.id, studentId: order.studentId }),
    ),
      auditStatement(context.assignment.staffUserId, "payment.succeeded", "order", order.id, {
        provider: "sandbox",
        paymentId,
      }),
    ]);
  } catch (error) {
    const racedReplay = await db.prepare(
      `SELECT order_id AS orderId FROM payment_transactions
       WHERE provider='sandbox' AND provider_event_id=? LIMIT 1`,
    ).bind(input.providerEventId).first<{ orderId: string }>();
    if (racedReplay?.orderId === order.id) {
      return {
        action: input.action,
        entityId: order.id,
        message: "支付回调已由并发请求处理，没有重复增加课时。",
        idempotentReplay: true,
      };
    }
    if (racedReplay) {
      throw new AppError(409, "PAYMENT_EVENT_REUSED", "The payment event belongs to another order.");
    }
    throw error;
  }
  return {
    action: input.action,
    entityId: order.id,
    message: "沙盒支付成功，课时已一次性入账并进入消息 outbox。",
  };
}

async function completeFollowUp(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "complete_follow_up" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin", "manager_admin"]);
  const actorId = requireStaffId(context);
  const task = await getD1().prepare(
    `SELECT id,assignee_id AS assigneeId,status FROM follow_up_tasks WHERE id=? LIMIT 1`,
  ).bind(input.taskId).first<{ id: string; assigneeId: string; status: string }>();
  if (!task) throw new AppError(404, "FOLLOW_UP_NOT_FOUND", "Follow-up task not found.");
  if (context.assignment.scopeType === "owner" && task.assigneeId !== actorId) {
    throw new AppError(403, "FOLLOW_UP_SCOPE_FORBIDDEN", "This follow-up belongs to another operator.");
  }
  if (task.status !== "open") throw new AppError(409, "FOLLOW_UP_CLOSED", "This follow-up is already closed.");
  await getD1().batch([
    getD1().prepare(
      `UPDATE follow_up_tasks SET status='completed',completion_note=?,
         completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='open'`,
    ).bind(input.note, task.id),
    auditStatement(
      actorId,
      "follow_up.completed",
      "follow_up_task",
      task.id,
      {},
      `audit_followup_completed_${task.id}`,
    ),
  ]);
  return { action: input.action, entityId: task.id, message: "跟进任务已完成并留痕。" };
}

async function requestRefund(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "request_refund" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["operations_admin"]);
  const actorId = requireStaffId(context);
  const db = getD1();
  const order = await db.prepare(
    `SELECT id,student_id AS studentId,status,amount_cents AS amountCents,
            credit_quantity AS creditQuantity
     FROM orders WHERE id=? LIMIT 1`,
  ).bind(input.orderId).first<OrderRow>();
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
  await assertStudentAccess(context, order.studentId);
  if (order.status !== "paid") {
    throw new AppError(409, "ORDER_NOT_REFUNDABLE", "Only a paid, unrefunded order can be refunded.");
  }
  if (input.amountCents !== Number(order.amountCents)) {
    throw new AppError(422, "FULL_REFUND_ONLY", "This version supports full-order refunds only.");
  }
  const openRefund = await db.prepare(
    `SELECT id FROM refunds WHERE order_id=? AND status IN ('requested','approved','completed') LIMIT 1`,
  ).bind(order.id).first<{ id: string }>();
  if (openRefund) throw new AppError(409, "REFUND_ALREADY_EXISTS", "This order already has a refund request.");
  const refundId = makeId("refund");
  await db.batch([
    db.prepare(
      `INSERT INTO refunds
        (id,order_id,requested_by_id,status,amount_cents,reason)
       VALUES (?,? ,?,'requested',?,?)`,
    ).bind(refundId, order.id, actorId, input.amountCents, input.reason),
    auditStatement(actorId, "refund.requested", "refund", refundId, { orderId: order.id }),
  ]);
  return { action: input.action, entityId: refundId, message: "退款申请已提交，等待主管复核。" };
}

async function approveRefund(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "approve_refund" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["manager_admin"]);
  const actorId = requireStaffId(context);
  const db = getD1();
  const refund = await db.prepare(
    `SELECT refund.id,refund.order_id AS orderId,refund.requested_by_id AS requestedById,
            refund.status,refund.amount_cents AS amountCents,
            orders.student_id AS studentId,orders.credit_quantity AS creditQuantity,
            orders.status AS orderStatus
     FROM refunds refund JOIN orders ON orders.id=refund.order_id
     WHERE refund.id=? LIMIT 1`,
  ).bind(input.refundId).first<{
    id: string; orderId: string; requestedById: string; status: string;
    amountCents: number; studentId: string; creditQuantity: number; orderStatus: string;
  }>();
  if (!refund) throw new AppError(404, "REFUND_NOT_FOUND", "Refund request not found.");
  if (refund.status !== "requested") throw new AppError(409, "REFUND_ALREADY_DECIDED", "This refund was already decided.");
  if (refund.requestedById === actorId) {
    throw new AppError(409, "SEPARATION_OF_DUTIES", "The requester cannot approve the same refund.");
  }
  if (!input.approve) {
    await db.batch([
      db.prepare(
        `UPDATE refunds SET status='rejected',approved_by_id=?,updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND status='requested'`,
      ).bind(actorId, refund.id),
      auditStatement(actorId, "refund.rejected", "refund", refund.id, { note: input.note }),
    ]);
    return { action: input.action, entityId: refund.id, message: "退款申请已拒绝。" };
  }
  if (refund.orderStatus !== "paid") {
    throw new AppError(409, "ORDER_NOT_REFUNDABLE", "The order is no longer refundable.");
  }
  const balance = await db.prepare(
    `SELECT COALESCE(SUM(transaction_record.quantity),0) AS balance
     FROM credit_accounts account_record
     LEFT JOIN credit_transactions transaction_record
       ON transaction_record.account_id=account_record.id
     WHERE account_record.student_id=?`,
  ).bind(refund.studentId).first<{ balance: number }>();
  if (Number(balance?.balance ?? 0) < Number(refund.creditQuantity)) {
    throw new AppError(
      409,
      "REFUND_CREDITS_ALREADY_USED",
      "The purchased credits have been used; create a reviewed adjustment instead.",
      { balance: Number(balance?.balance ?? 0), required: Number(refund.creditQuantity) },
    );
  }
  const paymentId = makeId("refund_payment");
  const outboxId = makeId("outbox");
  await db.batch([
    db.prepare(
      `UPDATE refunds SET status='completed',approved_by_id=?,completed_at=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='requested'`,
    ).bind(actorId, refund.id),
    db.prepare(
      `UPDATE orders SET status='refunded',updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='paid'`,
    ).bind(refund.orderId),
    db.prepare(
      `INSERT INTO payment_transactions
        (id,order_id,provider,provider_event_id,transaction_type,status,amount_cents)
       VALUES (?,?,'sandbox',?,'refund','succeeded',?)`,
    ).bind(paymentId, refund.orderId, `refund_${refund.id}`, refund.amountCents),
    db.prepare(
      `INSERT INTO credit_transactions
        (id,account_id,kind,quantity,source_type,source_id,note,created_by_id)
       SELECT ?,account_record.id,'reversal',?,'refund',?,'Refunded unused credits',?
       FROM credit_accounts account_record WHERE account_record.student_id=?`,
    ).bind(
      `credit_refund_${refund.id}`,
      -Number(refund.creditQuantity),
      refund.id,
      actorId,
      refund.studentId,
    ),
    db.prepare(
      `INSERT INTO outbox_events
        (id,organization_id,event_type,aggregate_type,aggregate_id,dedupe_key,payload_json)
       VALUES (?,?,'refund.completed','refund',?,?,?)`,
    ).bind(
      outboxId,
      context.account.organizationId,
      refund.id,
      `refund.completed:${refund.id}`,
      JSON.stringify({ refundId: refund.id, orderId: refund.orderId }),
    ),
    auditStatement(actorId, "refund.completed", "refund", refund.id, { note: input.note }),
  ]);
  return { action: input.action, entityId: refund.id, message: "退款完成，未使用课时已冲销。" };
}

async function updatePayroll(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "approve_payroll_period" | "mark_payroll_paid" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["manager_admin"]);
  const actorId = requireStaffId(context);
  const db = getD1();
  const period = await db.prepare(
    `SELECT id,status FROM payroll_periods WHERE id=? LIMIT 1`,
  ).bind(input.payrollPeriodId).first<{ id: string; status: string }>();
  if (!period) throw new AppError(404, "PAYROLL_PERIOD_NOT_FOUND", "Payroll period not found.");
  const approving = input.action === "approve_payroll_period";
  const expected = approving ? "open" : "approved";
  if (period.status !== expected) {
    throw new AppError(409, "PAYROLL_STATE_CONFLICT", `Payroll period must be ${expected}.`);
  }
  const next = approving ? "approved" : "paid";
  const entryNext = approving ? "approved" : "paid";
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE payroll_periods SET status=?,approved_by_id=COALESCE(approved_by_id,?),
         paid_at=CASE WHEN ?='paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
         updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?`,
    ).bind(next, actorId, next, period.id, expected),
    db.prepare(
      `UPDATE payroll_entries SET status=?,updated_at=CURRENT_TIMESTAMP
       WHERE payroll_period_id=? AND status=?`,
    ).bind(entryNext, period.id, approving ? "accrued" : "approved"),
    auditStatement(
      actorId,
      approving ? "payroll.approved" : "payroll.paid",
      "payroll_period",
      period.id,
      {},
      `audit_payroll_${next}_${period.id}`,
    ),
  ];
  if (!approving) {
    statements.push(db.prepare(
      `INSERT INTO outbox_events
        (id,organization_id,event_type,aggregate_type,aggregate_id,dedupe_key,payload_json)
       VALUES (?,?,'payroll.paid','payroll_period',?,?,?)`,
    ).bind(
      makeId("outbox"),
      context.account.organizationId,
      period.id,
      `payroll.paid:${period.id}`,
      JSON.stringify({ payrollPeriodId: period.id }),
    ));
  }
  await db.batch(statements);
  return {
    action: input.action,
    entityId: period.id,
    message: approving ? "薪资周期已审批并锁定。" : "薪资周期已标记支付并写入通知 outbox。",
  };
}

async function processOutbox(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "process_outbox" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["system_admin"]);
  const db = getD1();
  const rows = await db.prepare(
    `SELECT id FROM outbox_events
     WHERE organization_id=? AND status IN ('pending','failed')
       AND (next_attempt_at IS NULL OR next_attempt_at<=CURRENT_TIMESTAMP)
     ORDER BY created_at LIMIT ?`,
  ).bind(context.account.organizationId, input.limit).all<{ id: string }>();
  if (rows.results.length === 0) {
    return { action: input.action, message: "当前没有可处理的 outbox 事件。", details: { processed: 0 } };
  }
  const statements = rows.results.map((row) => db.prepare(
    `UPDATE outbox_events SET status='completed',attempts=attempts+1,
       completed_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=? AND status IN ('pending','failed')`,
  ).bind(row.id));
  statements.push(auditStatement(null, "outbox.batch_processed", "outbox_batch", makeId("batch"), {
    accountId: context.account.id,
    count: rows.results.length,
    adapter: "sandbox",
  }));
  await db.batch(statements);
  return {
    action: input.action,
    message: `已处理 ${rows.results.length} 个待发送任务。`,
    details: { processed: rows.results.length },
  };
}

async function requestSupport(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "request_support_session" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["system_admin"]);
  const allowedScopes = new Set([
    "diagnostics.read",
    "jobs.retry",
    "integrations.test",
    "business.masked_read",
  ]);
  if (input.scope.some((scope) => !allowedScopes.has(scope))) {
    throw new AppError(
      422,
      "UNSUPPORTED_SUPPORT_SCOPE",
      "One or more requested support permissions are not available.",
    );
  }
  const db = getD1();
  const existing = await db.prepare(
    `SELECT id FROM support_sessions
     WHERE system_admin_account_id=? AND status IN ('requested','active') LIMIT 1`,
  ).bind(context.account.id).first<{ id: string }>();
  if (existing) throw new AppError(409, "SUPPORT_SESSION_ALREADY_OPEN", "An emergency support session is already open.");
  const sessionId = makeId("support");
  await db.batch([
    db.prepare(
      `INSERT INTO support_sessions
        (id,organization_id,system_admin_account_id,reason,scope_json,status)
       VALUES (?,?,?,?,?,'requested')`,
    ).bind(
      sessionId,
      context.account.organizationId,
      context.account.id,
      input.reason,
      JSON.stringify({ permissions: input.scope, requestedMinutes: input.minutes }),
    ),
    auditStatement(null, "support.requested", "support_session", sessionId, {
      accountId: context.account.id,
      requestedMinutes: input.minutes,
    }),
  ]);
  return { action: input.action, entityId: sessionId, message: "紧急支持申请已提交，尚未获得业务写权限。" };
}

async function approveSupport(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "approve_support_session" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["manager_admin"]);
  const actorId = requireStaffId(context);
  const support = await getD1().prepare(
    `SELECT id,status,system_admin_account_id AS systemAdminAccountId
     FROM support_sessions WHERE id=? LIMIT 1`,
  ).bind(input.supportSessionId).first<{
    id: string;
    status: string;
    systemAdminAccountId: string;
  }>();
  if (!support) throw new AppError(404, "SUPPORT_SESSION_NOT_FOUND", "Support session not found.");
  if (support.status !== "requested") throw new AppError(409, "SUPPORT_SESSION_STATE_CONFLICT", "Only a requested session can be approved.");
  if (support.systemAdminAccountId === context.account.id) {
    throw new AppError(
      409,
      "SEPARATION_OF_DUTIES",
      "A system administrator cannot approve their own emergency access request.",
    );
  }
  await getD1().batch([
    getD1().prepare(
      `UPDATE support_sessions SET status='active',approved_by_id=?,starts_at=CURRENT_TIMESTAMP,
         expires_at=datetime('now',? || ' minutes') WHERE id=? AND status='requested'`,
    ).bind(actorId, String(input.minutes), support.id),
    auditStatement(
      actorId,
      "support.approved",
      "support_session",
      support.id,
      { minutes: input.minutes },
      `audit_support_approved_${support.id}`,
    ),
  ]);
  return { action: input.action, entityId: support.id, message: `临时支持会话已批准，有效期 ${input.minutes} 分钟。` };
}

async function updateSetting(
  context: CommandContext,
  input: Extract<PlatformCommandInput, { action: "update_setting" }>,
): Promise<PlatformCommandResult> {
  allow(context, ["manager_admin"]);
  const actorId = requireStaffId(context);
  const allowedSettingKeys = new Set([
    "attendance.policy",
    "organization.locale",
    "renewal.threshold",
    "trial.policy",
    "payroll.policy",
  ]);
  if (!allowedSettingKeys.has(input.key)) {
    throw new AppError(422, "SETTING_NOT_ALLOWED", "This setting cannot be changed through the workspace.");
  }
  const valueJson = JSON.stringify(input.value);
  if (valueJson.length > 16_000) throw new AppError(413, "SETTING_TOO_LARGE", "Setting value is too large.");
  const settingId = makeId("setting");
  await getD1().batch([
    getD1().prepare(
      `INSERT INTO organization_settings
        (id,organization_id,setting_key,value_json,updated_by_id)
       VALUES (?,?,?,?,?)
       ON CONFLICT(organization_id,setting_key) DO UPDATE SET
         value_json=excluded.value_json,updated_by_id=excluded.updated_by_id,
         updated_at=CURRENT_TIMESTAMP`,
    ).bind(settingId, context.account.organizationId, input.key, valueJson, actorId),
    auditStatement(actorId, "setting.updated", "organization_setting", input.key),
  ]);
  return { action: input.action, entityId: input.key, message: "机构设置已更新并记入审计。" };
}

export async function executePlatformCommand(
  context: CommandContext,
  input: PlatformCommandInput,
): Promise<PlatformCommandResult> {
  try {
    switch (input.action) {
      case "create_inquiry": return await createInquiry(context, input);
      case "schedule_trial": return await scheduleTrial(context, input);
      case "record_trial_outcome": return await recordTrialOutcome(context, input);
      case "convert_inquiry": return await convertInquiry(context, input);
      case "create_order": return await createOrder(context, input);
      case "enroll_student": return await enrollStudent(context, input);
      case "end_enrollment": return await endEnrollment(context, input);
      case "transfer_student_owner": return await transferStudentOwner(context, input);
      case "request_teacher_leave": return await requestTeacherLeave(context, input);
      case "decide_teacher_leave": return await decideTeacherLeave(context, input);
      case "assign_substitute": return await assignSubstitute(context, input);
      case "sandbox_pay_order": return await sandboxPayOrder(context, input);
      case "complete_follow_up": return await completeFollowUp(context, input);
      case "request_refund": return await requestRefund(context, input);
      case "approve_refund": return await approveRefund(context, input);
      case "approve_payroll_period":
      case "mark_payroll_paid": return await updatePayroll(context, input);
      case "process_outbox": return await processOutbox(context, input);
      case "request_support_session": return await requestSupport(context, input);
      case "approve_support_session": return await approveSupport(context, input);
      case "update_setting": return await updateSetting(context, input);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const knownRules: Array<[string, string, string]> = [
      ["TEACHER_SCHEDULE_CONFLICT", "TEACHER_SCHEDULE_CONFLICT", "The teacher already has an overlapping class."],
      ["ROOM_SCHEDULE_CONFLICT", "ROOM_SCHEDULE_CONFLICT", "The room already has an overlapping class."],
      ["STUDENT_SCHEDULE_CONFLICT", "STUDENT_SCHEDULE_CONFLICT", "The student already has an overlapping class."],
      ["CLASS_CAPACITY_EXCEEDED", "CLASS_AT_CAPACITY", "The class has no remaining places."],
      ["SESSION_ROSTER_IS_FROZEN", "ROSTER_FROZEN", "The attendance roster is already frozen."],
    ];
    const matched = knownRules.find(([needle]) => message.includes(needle));
    if (matched) throw new AppError(409, matched[1], matched[2]);
    if (
      message.includes("SQLITE_CONSTRAINT") ||
      message.includes("UNIQUE constraint failed") ||
      message.includes("FOREIGN KEY constraint failed")
    ) {
      throw new AppError(
        409,
        "BUSINESS_WRITE_CONFLICT",
        "The operation conflicted with a concurrent change or business rule. Refresh and retry.",
      );
    }
    throw error;
  }
}
