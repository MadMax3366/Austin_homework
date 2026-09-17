import "server-only";

import { getD1 } from "@/db";
import type {
  PlatformAccount,
  PlatformRole,
  RoleAssignment,
} from "@/lib/account-auth";
import { AppError, melbourneDate, weekRangeForDate } from "@/lib/domain";

export type OverviewMetric = {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "positive";
};

export type OverviewSection = {
  id: string;
  title: string;
  rows: Array<Record<string, string | number | null>>;
  totalRows?: number;
  page?: number;
  pageSize?: number;
};

export type PlatformOverview = {
  role: PlatformRole;
  title: string;
  metrics: OverviewMetric[];
  sections: OverviewSection[];
  context?: {
    organizationId?: string;
    studentId?: string;
    lowBalanceThreshold?: number;
    studentQuery?: string;
    ownedStudentCount?: number;
    organizationStudentCount?: number;
    weekStartsOn?: string;
    weekEndsOn?: string;
    businessDate?: string;
  };
};

type OperationsOverviewOptions = {
  studentQuery: string;
  studentPage: number;
};

const STUDENT_PAGE_SIZE = 25;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function operationsOverview(
  account: PlatformAccount,
  assignment: RoleAssignment,
  options: OperationsOverviewOptions,
): Promise<PlatformOverview> {
  const db = getD1();
  const today = melbourneDate();
  const week = weekRangeForDate(today);
  const thresholdSetting = await db.prepare(
    `SELECT value_json AS valueJson FROM organization_settings
     WHERE organization_id=? AND setting_key='renewal.threshold' LIMIT 1`,
  ).bind(account.organizationId).first<{ valueJson: string }>();
  let lowBalanceThreshold = 3;
  if (thresholdSetting?.valueJson) {
    try {
      const value = JSON.parse(thresholdSetting.valueJson) as { credits?: unknown };
      const configured = Number(value.credits);
      if (Number.isInteger(configured) && configured >= 0 && configured <= 20) {
        lowBalanceThreshold = configured;
      }
    } catch {
      lowBalanceThreshold = 3;
    }
  }
  const studentQuery = options.studentQuery.trim();
  const studentPattern = `%${escapeLike(studentQuery)}%`;
  const studentOffset = (options.studentPage - 1) * STUDENT_PAGE_SIZE;
  const [
    summary,
    inquiries,
    trialFollowUps,
    pendingTrialOutcomes,
    lowBalances,
    lowBalanceCount,
    trials,
    tasks,
    schedule,
    students,
    studentCount,
    adminWorkloads,
    teachers,
    rooms,
    classes,
  ] = await Promise.all([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM inquiries
       WHERE organization_id=? AND status NOT IN ('won','lost')
         AND (?='organization' OR owner_admin_id=?)) AS activeInquiries,
      (SELECT COUNT(*) FROM follow_up_tasks
       WHERE organization_id=? AND status='open'
         AND datetime(due_at) < datetime('now')
         AND (?='organization' OR assignee_id=?)) AS overdueTasks,
      (SELECT COUNT(*)
       FROM trial_bookings booking
       JOIN inquiries inquiry ON inquiry.id=booking.inquiry_id
       JOIN lesson_sessions session ON session.id=booking.lesson_session_id
       WHERE inquiry.organization_id=? AND session.session_date=?
         AND session.status='scheduled'
         AND (?='organization' OR inquiry.owner_admin_id=?)) AS trialsToday,
      (SELECT COUNT(*) FROM students) AS organizationStudents,
      (SELECT COUNT(*) FROM students WHERE owner_admin_id=?) AS ownedStudents,
      (SELECT COUNT(*) FROM staff_users WHERE role='admin' AND active=1) AS operationsAdmins,
      (SELECT COUNT(*) FROM staff_users WHERE role='teacher' AND active=1) AS teachers,
      (SELECT COUNT(*) FROM class_series
       WHERE active=1 AND session_kind='regular') AS weeklyClasses`)
      .bind(
        account.organizationId,
        assignment.scopeType,
        assignment.staffUserId,
        account.organizationId,
        assignment.scopeType,
        assignment.staffUserId,
        account.organizationId,
        today,
        assignment.scopeType,
        assignment.staffUserId,
        assignment.staffUserId,
      )
      .first<Record<string, number>>(),
    db.prepare(`SELECT inquiry.id,
        COALESCE(student.preferred_name,student.legal_name) AS student,
        inquiry.status, inquiry.source,
        inquiry.next_follow_up_at AS nextFollowUpAt,
        staff.display_name AS owner
      FROM inquiries inquiry
      JOIN students student ON student.id=inquiry.student_id
      JOIN staff_users staff ON staff.id=inquiry.owner_admin_id
      WHERE inquiry.organization_id=?
        AND (?='organization' OR inquiry.owner_admin_id=?)
      ORDER BY inquiry.created_at DESC LIMIT 20`)
      .bind(account.organizationId, assignment.scopeType, assignment.staffUserId)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT task.id,
        'trial_follow_up' AS queueType,
        inquiry.id AS inquiryId,
        inquiry.student_id AS studentId,
        COALESCE(student.preferred_name,student.legal_name) AS student,
        booking.id AS trialBookingId,booking.outcome,
        session.session_date AS trialDate,task.due_at AS dueAt,
        task.status
      FROM follow_up_tasks task
      JOIN inquiries inquiry ON inquiry.id=task.inquiry_id
      JOIN students student ON student.id=inquiry.student_id
      LEFT JOIN trial_bookings booking ON booking.id=(
        SELECT latest.id FROM trial_bookings latest
        WHERE latest.inquiry_id=inquiry.id
        ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1
      )
      LEFT JOIN lesson_sessions session ON session.id=booking.lesson_session_id
      WHERE task.organization_id=? AND task.task_type='trial_follow_up'
        AND task.status='open'
        AND (session.status='completed' OR booking.outcome<>'pending')
        AND (?='organization' OR task.assignee_id=?)
      ORDER BY datetime(task.due_at),task.created_at LIMIT 30`)
      .bind(account.organizationId, assignment.scopeType, assignment.staffUserId)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT booking.id,
        'record_outcome' AS queueType,
        inquiry.id AS inquiryId,inquiry.student_id AS studentId,
        COALESCE(student.preferred_name,student.legal_name) AS student,
        booking.id AS trialBookingId,booking.outcome,
        session.session_date AS trialDate,
        staff.display_name AS teacher,session.status AS sessionStatus
      FROM trial_bookings booking
      JOIN inquiries inquiry ON inquiry.id=booking.inquiry_id
      JOIN students student ON student.id=inquiry.student_id
      JOIN lesson_sessions session ON session.id=booking.lesson_session_id
      JOIN staff_users staff ON staff.id=session.teacher_id
      WHERE inquiry.organization_id=? AND booking.outcome='pending'
        AND session.status='completed'
        AND (?='organization' OR inquiry.owner_admin_id=?)
      ORDER BY session.session_date,session.local_end_time LIMIT 30`)
      .bind(account.organizationId, assignment.scopeType, assignment.staffUserId)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT student.id AS studentId,
        COALESCE(student.preferred_name,student.legal_name) AS student,
        staff.display_name AS owner,
        COALESCE(SUM(transaction_record.quantity),0) AS credits,
        CASE WHEN COALESCE(SUM(transaction_record.quantity),0)<=0
          THEN 'urgent' ELSE 'renew_soon' END AS risk
      FROM students student
      JOIN credit_accounts account_record ON account_record.student_id=student.id
      LEFT JOIN credit_transactions transaction_record
        ON transaction_record.account_id=account_record.id
      LEFT JOIN staff_users staff ON staff.id=student.owner_admin_id
      WHERE student.lifecycle_status='active'
        AND (?='organization' OR student.owner_admin_id=?)
      GROUP BY student.id,student.preferred_name,student.legal_name,staff.display_name
      HAVING COALESCE(SUM(transaction_record.quantity),0)<=?
      ORDER BY credits,student.legal_name,student.id LIMIT 30`)
      .bind(assignment.scopeType, assignment.staffUserId, lowBalanceThreshold)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT COUNT(*) AS count FROM (
      SELECT student.id
      FROM students student
      JOIN credit_accounts account_record ON account_record.student_id=student.id
      LEFT JOIN credit_transactions transaction_record
        ON transaction_record.account_id=account_record.id
      WHERE student.lifecycle_status='active'
        AND (?='organization' OR student.owner_admin_id=?)
      GROUP BY student.id
      HAVING COALESCE(SUM(transaction_record.quantity),0)<=?
    ) low_credit_students`)
      .bind(assignment.scopeType, assignment.staffUserId, lowBalanceThreshold)
      .first<{ count: number }>(),
    db.prepare(`SELECT booking.id,inquiry.id AS inquiryId,
        COALESCE(student.preferred_name,student.legal_name) AS student,
        booking.outcome,booking.conversion_decision AS decision,
        session.id AS sessionId,session.session_date AS sessionDate,
        session.status AS sessionStatus,staff.display_name AS teacher
      FROM trial_bookings booking
      JOIN inquiries inquiry ON inquiry.id=booking.inquiry_id
      JOIN students student ON student.id=inquiry.student_id
      JOIN lesson_sessions session ON session.id=booking.lesson_session_id
      JOIN staff_users staff ON staff.id=session.teacher_id
      WHERE inquiry.organization_id=?
        AND (?='organization' OR inquiry.owner_admin_id=?)
      ORDER BY session.session_date DESC LIMIT 30`)
      .bind(account.organizationId, assignment.scopeType, assignment.staffUserId)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT task.id,
        COALESCE(student.preferred_name,student.legal_name) AS student,
        task.task_type AS taskType, task.status, task.due_at AS dueAt,
        faq.category AS faqCategory,faq.question_text AS question
      FROM follow_up_tasks task
      LEFT JOIN students student ON student.id=task.student_id
      LEFT JOIN faq_interactions faq ON faq.handoff_task_id=task.id
      WHERE task.organization_id=? AND task.status='open'
        AND (?='organization' OR task.assignee_id=?)
      ORDER BY task.due_at LIMIT 20`)
      .bind(account.organizationId, assignment.scopeType, assignment.staffUserId)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT session.id, series.name AS className,
        session.session_date AS sessionDate,
        session.session_kind AS kind, session.local_start_time AS startTime,
        session.local_end_time AS endTime, series.room,
        staff.display_name AS teacher, session.status,
        COUNT(participant.id) AS participants
      FROM lesson_sessions session
      JOIN class_series series ON series.id=session.class_series_id
      JOIN staff_users staff ON staff.id=session.teacher_id
      LEFT JOIN session_participants participant
        ON participant.lesson_session_id=session.id AND participant.removed_at IS NULL
      WHERE session.session_date BETWEEN ? AND ?
      GROUP BY session.id ORDER BY session.session_date,session.local_start_time`)
      .bind(week.startsOn, week.endsOn)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT student.id,
        COALESCE(student.preferred_name,student.legal_name) AS student,
        student.lifecycle_status AS status, staff.display_name AS owner,
        COALESCE(SUM(transaction_record.quantity),0) AS credits
      FROM students student
      LEFT JOIN staff_users staff ON staff.id=student.owner_admin_id
      LEFT JOIN credit_accounts account_record ON account_record.student_id=student.id
      LEFT JOIN credit_transactions transaction_record
        ON transaction_record.account_id=account_record.id
      WHERE (?='' OR student.id LIKE ? ESCAPE '\\'
        OR student.legal_name LIKE ? ESCAPE '\\'
        OR COALESCE(student.preferred_name,'') LIKE ? ESCAPE '\\'
        OR COALESCE(staff.display_name,'') LIKE ? ESCAPE '\\')
      GROUP BY student.id
      ORDER BY student.legal_name,student.id LIMIT ? OFFSET ?`)
      .bind(
        studentQuery,
        studentPattern,
        studentPattern,
        studentPattern,
        studentPattern,
        STUDENT_PAGE_SIZE,
        studentOffset,
      )
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT COUNT(*) AS count
      FROM students student
      LEFT JOIN staff_users staff ON staff.id=student.owner_admin_id
      WHERE (?='' OR student.id LIKE ? ESCAPE '\\'
        OR student.legal_name LIKE ? ESCAPE '\\'
        OR COALESCE(student.preferred_name,'') LIKE ? ESCAPE '\\'
        OR COALESCE(staff.display_name,'') LIKE ? ESCAPE '\\')`)
      .bind(
        studentQuery,
        studentPattern,
        studentPattern,
        studentPattern,
        studentPattern,
      )
      .first<{ count: number }>(),
    db.prepare(`SELECT staff.id,
        staff.display_name AS admin,
        staff.email,
        COUNT(student.id) AS students
      FROM staff_users staff
      LEFT JOIN students student ON student.owner_admin_id=staff.id
      WHERE staff.role='admin' AND staff.active=1
      GROUP BY staff.id,staff.display_name,staff.email
      ORDER BY staff.display_name,staff.id`)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT id,display_name AS name,email
      FROM staff_users WHERE role='teacher' AND active=1 ORDER BY display_name`)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT id,name,capacity
      FROM rooms WHERE organization_id=? AND active=1 ORDER BY name`)
      .bind(account.organizationId)
      .all<Record<string, string | number | null>>(),
    db.prepare(`SELECT id,name,subject,capacity
      FROM class_series WHERE active=1 AND session_kind='regular' ORDER BY name`)
      .all<Record<string, string | number | null>>(),
  ]);
  const trialAttention = [
    ...pendingTrialOutcomes.results,
    ...trialFollowUps.results,
  ];
  return {
    role: "operations_admin",
    title: "运营工作台",
    context: {
      organizationId: account.organizationId,
      lowBalanceThreshold,
      studentQuery,
      ownedStudentCount: Number(summary?.ownedStudents ?? 0),
      organizationStudentCount: Number(summary?.organizationStudents ?? 0),
      weekStartsOn: week.startsOn,
      weekEndsOn: week.endsOn,
      businessDate: today,
    },
    metrics: [
      { label: "试听完成待跟进", value: trialAttention.length, tone: "warning" },
      { label: `低课时学生（≤${lowBalanceThreshold}）`, value: Number(lowBalanceCount?.count ?? 0), tone: "warning" },
      { label: "我的学生", value: Number(summary?.ownedStudents ?? 0) },
      { label: "全机构学生", value: Number(summary?.organizationStudents ?? 0) },
      { label: "活跃咨询", value: Number(summary?.activeInquiries ?? 0) },
      { label: "今日试听", value: Number(summary?.trialsToday ?? 0) },
    ],
    sections: [
      { id: "trial-attention", title: "试听完成待跟进", rows: trialAttention },
      { id: "low-balances", title: `低课时学生（≤${lowBalanceThreshold}）`, rows: lowBalances.results },
      { id: "inquiries", title: "招生与试听", rows: inquiries.results },
      { id: "trials", title: "试听结果", rows: trials.results },
      { id: "tasks", title: "待跟进任务", rows: tasks.results },
      { id: "schedule", title: "本周课表", rows: schedule.results },
      {
        id: "students",
        title: "学生与课时",
        rows: students.results,
        totalRows: Number(studentCount?.count ?? 0),
        page: options.studentPage,
        pageSize: STUDENT_PAGE_SIZE,
      },
      {
        id: "admin-workloads",
        title: "运营学生负载",
        rows: adminWorkloads.results,
        totalRows: adminWorkloads.results.length,
      },
      {
        id: "resources",
        title: "排课资源",
        rows: [
          ...teachers.results.map((row) => ({ type: "teacher", ...row })),
          ...rooms.results.map((row) => ({ type: "room", ...row })),
          ...classes.results.map((row) => ({ type: "class", ...row })),
        ],
      },
    ],
  };
}

async function managerOverview(account: PlatformAccount): Promise<PlatformOverview> {
  const db = getD1();
  const today = melbourneDate();
  const [summary, payroll, periods, ordersResult, refundsResult, exceptions, conflicts, support, adminWorkloads] =
    await Promise.all([
      db.prepare(`SELECT
        (SELECT COALESCE(SUM(amount_cents),0) FROM orders
         WHERE organization_id=? AND status='paid') AS paidRevenue,
        (SELECT COUNT(*) FROM refunds refund
         JOIN orders orders_record ON orders_record.id=refund.order_id
         WHERE orders_record.organization_id=?
           AND refund.status IN ('requested','approved')) AS pendingRefunds,
        (SELECT COALESCE(SUM(base_amount_cents+adjustment_cents),0)
         FROM payroll_entries entry
         JOIN payroll_periods period ON period.id=entry.payroll_period_id
         WHERE period.organization_id=? AND entry.status='accrued') AS accruedPayroll,
        (SELECT COUNT(*) FROM billing_exceptions
         WHERE status='open') AS billingExceptions,
        (SELECT COUNT(*) FROM students) AS totalStudents,
        (SELECT COUNT(*) FROM staff_users
         WHERE role='admin' AND active=1) AS operationsAdmins,
        (SELECT COUNT(*) FROM staff_users
         WHERE role='teacher' AND active=1) AS activeTeachers,
        (SELECT COUNT(*) FROM class_series
         WHERE active=1 AND session_kind='regular') AS weeklyClasses`)
        .bind(account.organizationId, account.organizationId, account.organizationId)
        .first<Record<string, number>>(),
      db.prepare(`SELECT entry.id, staff.display_name AS teacher,
          series.name AS className, session.session_date AS sessionDate,
          entry.session_kind AS kind,
          entry.base_amount_cents+entry.adjustment_cents AS amountCents,
          entry.status
        FROM payroll_entries entry
        JOIN staff_users staff ON staff.id=entry.teacher_id
        JOIN lesson_sessions session ON session.id=entry.lesson_session_id
        JOIN class_series series ON series.id=session.class_series_id
        JOIN payroll_periods period ON period.id=entry.payroll_period_id
        WHERE period.organization_id=?
        ORDER BY entry.created_at DESC LIMIT 30`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id,starts_on AS startsOn,ends_on AS endsOn,status,
          paid_at AS paidAt
        FROM payroll_periods WHERE organization_id=?
        ORDER BY starts_on DESC LIMIT 20`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT orders.id,
          COALESCE(student.preferred_name,student.legal_name) AS student,
          orders.order_type AS orderType, orders.status,
          orders.amount_cents AS amountCents,
          orders.credit_quantity AS credits, orders.created_at AS createdAt
        FROM orders JOIN students student ON student.id=orders.student_id
        WHERE orders.organization_id=?
        ORDER BY orders.created_at DESC LIMIT 30`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT refund.id,refund.order_id AS orderId,
          COALESCE(student.preferred_name,student.legal_name) AS student,
          refund.status,refund.amount_cents AS amountCents,refund.reason,
          refund.created_at AS createdAt
        FROM refunds refund
        JOIN orders order_record ON order_record.id=refund.order_id
        JOIN students student ON student.id=order_record.student_id
        WHERE order_record.organization_id=?
        ORDER BY refund.created_at DESC LIMIT 30`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT exception_record.id,
          participant.display_name AS student, exception_record.status,
          exception_record.reason, exception_record.created_at AS createdAt
        FROM billing_exceptions exception_record
        JOIN attendance ON attendance.id=exception_record.attendance_id
        JOIN session_participants participant
          ON participant.lesson_session_id=attendance.lesson_session_id
         AND participant.student_id=attendance.student_id
        ORDER BY exception_record.created_at DESC LIMIT 20`)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT first.id AS firstSession, second.id AS secondSession,
          teacher.display_name AS teacher,
          first.local_start_time AS firstStart, first.local_end_time AS firstEnd,
          second.local_start_time AS secondStart, second.local_end_time AS secondEnd
        FROM lesson_sessions first
        JOIN lesson_sessions second
          ON first.teacher_id=second.teacher_id
         AND first.session_date=second.session_date
         AND first.id<second.id
         AND first.status<>'cancelled' AND second.status<>'cancelled'
         AND first.local_start_time<second.local_end_time
         AND second.local_start_time<first.local_end_time
        JOIN staff_users teacher ON teacher.id=first.teacher_id
        WHERE first.session_date>=? LIMIT 20`)
        .bind(today)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id,reason,status,starts_at AS startsAt,
          expires_at AS expiresAt,created_at AS createdAt
        FROM support_sessions WHERE organization_id=?
        ORDER BY created_at DESC LIMIT 20`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT staff.id,
          staff.display_name AS admin,
          staff.email,
          COUNT(student.id) AS students
        FROM staff_users staff
        LEFT JOIN students student ON student.owner_admin_id=staff.id
        WHERE staff.role='admin' AND staff.active=1
        GROUP BY staff.id,staff.display_name,staff.email
        ORDER BY staff.display_name,staff.id`)
        .all<Record<string, string | number | null>>(),
    ]);
  return {
    role: "manager_admin",
    title: "主管管理台",
    context: { organizationId: account.organizationId },
    metrics: [
      { label: "全机构学生", value: Number(summary?.totalStudents ?? 0) },
      { label: "运营管理员", value: Number(summary?.operationsAdmins ?? 0) },
      { label: "在职老师", value: Number(summary?.activeTeachers ?? 0) },
      { label: "每周固定班", value: Number(summary?.weeklyClasses ?? 0) },
      { label: "已收款", value: "$" + (Number(summary?.paidRevenue ?? 0) / 100).toFixed(2), tone: "positive" },
      { label: "待处理退款", value: Number(summary?.pendingRefunds ?? 0), tone: "warning" },
      { label: "待核薪资", value: "$" + (Number(summary?.accruedPayroll ?? 0) / 100).toFixed(2) },
      { label: "课时异常", value: Number(summary?.billingExceptions ?? 0), tone: "warning" },
    ],
    sections: [
      {
        id: "admin-workloads",
        title: "运营学生负载",
        rows: adminWorkloads.results,
        totalRows: adminWorkloads.results.length,
      },
      { id: "conflicts", title: "排课冲突", rows: conflicts.results },
      { id: "payroll", title: "老师薪资", rows: payroll.results },
      { id: "payroll-periods", title: "薪资周期", rows: periods.results },
      { id: "finance", title: "订单与支付", rows: ordersResult.results },
      { id: "refunds", title: "退款审批", rows: refundsResult.results },
      { id: "exceptions", title: "业务异常与审批", rows: exceptions.results },
      { id: "support", title: "紧急支持审批", rows: support.results },
    ],
  };
}

async function portalOverview(
  role: "student" | "guardian",
  assignment: RoleAssignment,
  selectedStudentId?: string | null,
): Promise<PlatformOverview> {
  const db = getD1();
  let family: Array<Record<string, string | number | null>> = [];
  let studentId = assignment.studentId;
  if (role === "guardian") {
    if (!assignment.guardianId) {
      throw new AppError(403, "GUARDIAN_PROFILE_REQUIRED", "Guardian profile is not linked.");
    }
    const linked = await db.prepare(
      `SELECT student.id,
              COALESCE(student.preferred_name,student.legal_name) AS student,
              link.relationship,link.is_primary AS isPrimary
       FROM student_guardians link
       JOIN students student ON student.id=link.student_id
       WHERE link.guardian_id=?
       ORDER BY link.is_primary DESC,student.legal_name`,
    ).bind(assignment.guardianId).all<Record<string, string | number | null>>();
    family = linked.results;
    const allowedIds = new Set(family.map((row) => String(row.id)));
    if (selectedStudentId && !allowedIds.has(selectedStudentId)) {
      throw new AppError(403, "STUDENT_SCOPE_FORBIDDEN", "This student is not linked to the guardian account.");
    }
    studentId = selectedStudentId ?? (family[0]?.id ? String(family[0].id) : null);
  }
  if (!studentId) {
    return { role, title: role === "guardian" ? "家长门户" : "学生门户", metrics: [], sections: [] };
  }
  const today = melbourneDate();
  const week = weekRangeForDate(today);
  const [student, schedule, attendanceResult, ordersResult, messagesResult] =
    await Promise.all([
      db.prepare(`SELECT student.id,
          COALESCE(student.preferred_name,student.legal_name) AS student,
          student.lifecycle_status AS status,
          COALESCE(SUM(transaction_record.quantity),0) AS credits
        FROM students student
        LEFT JOIN credit_accounts account_record ON account_record.student_id=student.id
        LEFT JOIN credit_transactions transaction_record
          ON transaction_record.account_id=account_record.id
        WHERE student.id=? GROUP BY student.id`)
        .bind(studentId)
        .first<Record<string, string | number | null>>(),
      db.prepare(`SELECT session.id,series.name AS className,
          session.session_kind AS kind, session.session_date AS sessionDate,
          session.local_start_time AS startTime,
          session.local_end_time AS endTime, series.room,
          teacher.display_name AS teacher, session.status
        FROM session_participants participant
        JOIN lesson_sessions session ON session.id=participant.lesson_session_id
        JOIN class_series series ON series.id=session.class_series_id
        JOIN staff_users teacher ON teacher.id=session.teacher_id
        WHERE participant.student_id=? AND session.session_date BETWEEN ? AND ?
        ORDER BY session.session_date,session.local_start_time LIMIT 30`)
        .bind(studentId, week.startsOn, week.endsOn)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT series.name AS className,
          session.session_date AS sessionDate, attendance.status,
          session.feedback_json AS feedback
        FROM attendance
        JOIN lesson_sessions session ON session.id=attendance.lesson_session_id
        JOIN class_series series ON series.id=session.class_series_id
        WHERE attendance.student_id=?
        ORDER BY session.session_date DESC LIMIT 30`)
        .bind(studentId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id, description, status,
          amount_cents AS amountCents, credit_quantity AS credits,
          created_at AS createdAt
        FROM orders WHERE student_id=? ORDER BY created_at DESC LIMIT 30`)
        .bind(studentId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id, channel, subject AS title, body, status, sent_at AS sentAt
        FROM messages
        WHERE student_id=? OR (? IS NOT NULL AND guardian_id=?)
        ORDER BY created_at DESC LIMIT 30`)
        .bind(studentId, assignment.guardianId, assignment.guardianId)
        .all<Record<string, string | number | null>>(),
    ]);
  return {
    role,
    title: role === "guardian" ? "家长门户" : "学生门户",
    context: {
      studentId,
      weekStartsOn: week.startsOn,
      weekEndsOn: week.endsOn,
      businessDate: today,
    },
    metrics: [
      { label: "学生", value: String(student?.student ?? "—") },
      { label: "剩余课时", value: Number(student?.credits ?? 0) },
      { label: "本周课次", value: schedule.results.length },
      { label: "待支付订单", value: ordersResult.results.filter((row) => row.status === "pending").length, tone: "warning" },
    ],
    sections: [
      ...(role === "guardian" ? [{ id: "family", title: "家庭学生账户", rows: family }] : []),
      { id: "schedule", title: "课表与试听", rows: schedule.results },
      { id: "attendance", title: "出勤与课堂反馈", rows: attendanceResult.results },
      { id: "credits", title: "充值、续费与交易", rows: ordersResult.results },
      { id: "messages", title: "消息", rows: messagesResult.results },
    ],
  };
}

async function systemOverview(account: PlatformAccount): Promise<PlatformOverview> {
  const db = getD1();
  const [summary, integrations, jobs, outbox, audits, support] =
    await Promise.all([
      db.prepare(`SELECT
        (SELECT COUNT(*) FROM user_accounts
         WHERE organization_id=? AND status='active') AS accounts,
        (SELECT COUNT(*) FROM system_jobs
         WHERE organization_id=? AND status='failed') AS failedJobs,
        (SELECT COUNT(*) FROM outbox_events
         WHERE organization_id=? AND status IN ('pending','failed')) AS pendingEvents,
        (SELECT COUNT(*) FROM integration_configs
         WHERE organization_id=? AND status<>'healthy') AS unhealthyIntegrations`)
        .bind(account.organizationId, account.organizationId, account.organizationId, account.organizationId)
        .first<Record<string, number>>(),
      db.prepare(`SELECT integration_type AS type, provider_name AS provider,
          mode, status, last_checked_at AS lastCheckedAt
        FROM integration_configs WHERE organization_id=? ORDER BY integration_type`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id, job_type AS jobType, status, attempts,
          started_at AS startedAt, finished_at AS finishedAt,
          last_error AS lastError
        FROM system_jobs WHERE organization_id=? ORDER BY created_at DESC LIMIT 30`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id, event_type AS eventType,
          aggregate_type AS aggregateType, aggregate_id AS aggregateId,
          status, attempts, last_error AS lastError
        FROM outbox_events WHERE organization_id=? ORDER BY created_at DESC LIMIT 30`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id, action, entity_type AS entityType,
          entity_id AS entityId, created_at AS createdAt
        FROM audit_events ORDER BY created_at DESC LIMIT 30`)
        .all<Record<string, string | number | null>>(),
      db.prepare(`SELECT id, reason, status, starts_at AS startsAt,
          expires_at AS expiresAt, ended_at AS endedAt
        FROM support_sessions WHERE organization_id=? ORDER BY created_at DESC LIMIT 20`)
        .bind(account.organizationId)
        .all<Record<string, string | number | null>>(),
    ]);
  return {
    role: "system_admin",
    title: "系统运维台",
    context: { organizationId: account.organizationId },
    metrics: [
      { label: "活跃账户", value: Number(summary?.accounts ?? 0) },
      { label: "失败任务", value: Number(summary?.failedJobs ?? 0), tone: "warning" },
      { label: "待处理事件", value: Number(summary?.pendingEvents ?? 0), tone: "warning" },
      { label: "异常集成", value: Number(summary?.unhealthyIntegrations ?? 0), tone: "warning" },
    ],
    sections: [
      { id: "integrations", title: "外部服务与健康状态", rows: integrations.results },
      { id: "jobs", title: "后台任务", rows: jobs.results },
      { id: "outbox", title: "待发送事件", rows: outbox.results },
      { id: "support", title: "紧急支持会话", rows: support.results },
      { id: "audit", title: "近期审计", rows: audits.results },
    ],
  };
}

export async function getPlatformOverview(
  role: PlatformRole,
  account: PlatformAccount,
  assignment: RoleAssignment,
  options: {
    selectedStudentId?: string | null;
    studentQuery?: string;
    studentPage?: number;
  } = {},
): Promise<PlatformOverview> {
  switch (role) {
    case "operations_admin":
      return operationsOverview(account, assignment, {
        studentQuery: options.studentQuery ?? "",
        studentPage: options.studentPage ?? 1,
      });
    case "manager_admin":
      return managerOverview(account);
    case "student":
    case "guardian":
      return portalOverview(role, assignment, options.selectedStudentId);
    case "system_admin":
      return systemOverview(account);
    default:
      throw new AppError(400, "WORKSPACE_NOT_SUPPORTED", "This role uses a dedicated workspace.");
  }
}
